import "server-only";
import type { BoqDocument, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { storage } from "./storage";
import { extractFile, ExtractorRejected, ExtractorUnavailable, readRows } from "./extractor-client";
import type { ExtractResult, Issue } from "./extraction-schema";
import { planIngest } from "./ingest-plan";
import { AiError, runAiReview } from "./ai-service";
import { runAiLayout } from "./ai-layout";
import { columnMappingSchema, type ColumnMapping } from "./ai-validation";

/** An extraction with no progress for this long was interrupted (server restart). */
export const STALE_JOB_MS = 10 * 60 * 1000;

async function step(jobId: string, text: string) {
  await prisma.extractionJob.update({ where: { id: jobId }, data: { step: text } });
}

/**
 * Rule-based reading first. If it finds nothing or looks wrong, and AI is on
 * for this upload, the layout is read with AI help instead (ai-layout.ts);
 * if that fails too, the rule-based result stands with a note saying why.
 */
async function readBoq(doc: BoqDocument, file: Buffer, mapping: ColumnMapping | null, jobId: string): Promise<ExtractResult> {
  let result: ExtractResult | null = null;
  let rejected: ExtractorRejected | null = null;
  try {
    result = await extractFile(file, doc.fileName, mapping);
  } catch (e) {
    if (!(e instanceof ExtractorRejected && e.code === "NO_ITEMS")) throw e;
    rejected = e;
  }
  const reasons = result?.quality.recommend_ai ? result.quality.reasons.join("; ") : "no items were found";
  if (result && !result.quality.recommend_ai) return result;
  if (doc.aiChoice === "OFF") {
    if (!result) throw rejected!;
    return withIssue(result, { code: "LAYOUT_UNCERTAIN", severity: "warning", message: `This BOQ's layout looks unusual (${reasons}). Upload it again with AI switched on to read the layout with AI help.`, page: null });
  }

  try {
    await step(jobId, "Reading the layout with AI");
    const table = await readRows(file, doc.fileName, mapping);
    const plan = await runAiLayout(doc, table, async (text) => {
      await step(jobId, text);
      // Heartbeat: a long AI run must not look like an interrupted job.
      await prisma.boqDocument.update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
    });
    await step(jobId, "Rebuilding the BOQ from the AI layout");
    return await extractFile(file, doc.fileName, mapping, plan);
  } catch (e) {
    const code = e instanceof AiError ? e.message : e instanceof ExtractorRejected ? e.code : "UNAVAILABLE";
    if (!(e instanceof AiError || e instanceof ExtractorRejected || e instanceof ExtractorUnavailable)) console.error("AI layout reading failed", doc.id, e);
    const message = `AI layout reading didn't finish (${code})`;
    if (!result) throw new ExtractorRejected(rejected!.code, `${rejected!.message} ${message}.`);
    return withIssue(result, { code: "AI_LAYOUT_FAILED", severity: "warning", message: `This BOQ's layout looks unusual (${reasons}). ${message}, so this is the rule-based reading — check it carefully.`, page: null });
  }
}

function withIssue(result: ExtractResult, issue: Issue): ExtractResult {
  return { ...result, issues: [issue, ...result.issues] };
}

/**
 * Reads the stored BOQ, sends it to the extractor and saves the result.
 * Runs in the background after the upload request returns; progress is
 * written to the job row, which the upload page polls.
 */
export async function runExtraction(documentId: string, jobId: string, userId: string) {
  const startedAt = new Date();
  try {
    const doc = await prisma.boqDocument.findUniqueOrThrow({ where: { id: documentId } });
    await prisma.extractionJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt, step: "Reading the BOQ" } });

    const file = await storage.get(doc.fileKey);
    const result = await readBoq(doc, file, doc.columnMapping ? columnMappingSchema.parse(doc.columnMapping) : null, jobId);

    await step(jobId, "Saving items");
    const plan = planIngest(result, documentId, doc.currency);

    await prisma.$transaction(
      async (tx) => {
        // A retry replaces whatever an earlier attempt saved.
        await tx.bill.deleteMany({ where: { documentId } });
        await tx.aiSuggestion.updateMany({ where: { documentId, status: "PENDING" }, data: { status: "SUPERSEDED" } });
        await tx.bill.createMany({ data: plan.bills });
        await tx.section.createMany({ data: plan.sections });
        await tx.mainDescription.createMany({ data: plan.mainDescriptions });
        await tx.boqItem.createMany({ data: plan.items.map((i) => ({ ...i, flags: i.flags as Prisma.InputJsonValue })) });
        if (plan.rates.length) await tx.rate.createMany({ data: plan.rates });
        await tx.boqDocument.update({
          where: { id: documentId },
          data: {
            status: "REVIEW",
            aiStatus: doc.aiChoice === "OFF" ? "OFF" : "QUEUED",
            aiMessage: null,
            reviewVersion: { increment: 1 },
            acceptedIssues: [],
            pageCount: result.stats.pages,
            itemCount: plan.counts.items,
            errorCount: plan.counts.errors,
            warningCount: plan.counts.warnings,
            issues: result.issues as Prisma.InputJsonValue,
            cover: result.cover as Prisma.InputJsonValue,
            extractor: `${result.parser} ${result.version}`,
            failureCode: null,
            failureMessage: null,
          },
        });
        await tx.extractionJob.update({
          where: { id: jobId },
          data: { status: "SUCCEEDED", step: doc.aiChoice === "OFF" ? "Done" : "Preparing AI suggestions", finishedAt: new Date() },
        });
        await audit(
          {
            userId,
            action: "document.extracted",
            entity: "document",
            entityId: documentId,
            details: { items: plan.counts.items, errors: plan.counts.errors, warnings: plan.counts.warnings, parser: result.parser, ms: Date.now() - startedAt.getTime() },
          },
          tx,
        );
      },
      { timeout: 60_000 },
    );
    // AI failures never change a successful extraction to FAILED.
    if (doc.aiChoice !== "OFF") {
      try { await runAiReview(documentId, userId); }
      catch { await prisma.boqDocument.update({ where: { id: documentId }, data: { aiStatus: "SKIPPED", aiMessage: "AI unavailable. Review the rule-based extraction normally." } }).catch(() => {}); }
      await step(jobId, "Done");
    }
  } catch (e) {
    const known = e instanceof ExtractorRejected || e instanceof ExtractorUnavailable;
    const code = e instanceof ExtractorRejected ? e.code : e instanceof ExtractorUnavailable ? "UNAVAILABLE" : "INTERNAL";
    const message = known ? (e as Error).message : "Something went wrong while saving the extraction. Try again.";
    if (!known) console.error("Extraction failed", documentId, e);
    await prisma.boqDocument.update({ where: { id: documentId }, data: { status: "FAILED", failureCode: code, failureMessage: message, aiStatus: "SKIPPED", aiMessage: "AI skipped because extraction failed." } });
    await prisma.extractionJob.update({ where: { id: jobId }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
    await audit({ userId, action: "document.failed", entity: "document", entityId: documentId, details: { code } });
  }
}

/** Marks extractions interrupted by a restart as failed, so they can be retried. */
export async function failStaleJobs(documentId?: string) {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  await prisma.boqDocument.updateMany({ where: { ...(documentId ? { id: documentId } : {}), aiStatus: { in: ["RUNNING", "QUEUED"] }, updatedAt: { lt: cutoff }, status: "REVIEW" }, data: { aiStatus: "PARTIAL", aiMessage: "AI processing was interrupted. Existing suggestions can be reviewed; extraction is complete." } });
  const stale = await prisma.extractionJob.findMany({
    // AI layout reading touches the document as it goes, so a long run stays live.
    where: { status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: cutoff }, document: { updatedAt: { lt: cutoff } }, ...(documentId ? { documentId } : {}) },
    select: { id: true, documentId: true },
  });
  for (const job of stale) {
    const message = "The extraction was interrupted. Retry it.";
    await prisma.extractionJob.update({ where: { id: job.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
    await prisma.boqDocument.updateMany({
      where: { id: job.documentId, status: "PROCESSING" },
      data: { status: "FAILED", failureCode: "INTERRUPTED", failureMessage: message, aiStatus: "SKIPPED", aiMessage: "AI skipped because extraction was interrupted." },
    });
  }
}
