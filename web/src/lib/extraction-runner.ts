import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { storage } from "./storage";
import { extractFile, ExtractorRejected, ExtractorUnavailable } from "./extractor-client";
import { planIngest } from "./ingest-plan";
import { runAiReview } from "./ai-service";
import { columnMappingSchema } from "./ai-validation";

/** An extraction still "running" after this long was interrupted (server restart). */
export const STALE_JOB_MS = 10 * 60 * 1000;

async function step(jobId: string, text: string) {
  await prisma.extractionJob.update({ where: { id: jobId }, data: { step: text } });
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
    const result = await extractFile(file, doc.fileName, doc.columnMapping ? columnMappingSchema.parse(doc.columnMapping) : null);

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
            details: { items: plan.counts.items, errors: plan.counts.errors, warnings: plan.counts.warnings, ms: Date.now() - startedAt.getTime() },
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
    where: { status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: cutoff }, ...(documentId ? { documentId } : {}) },
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
