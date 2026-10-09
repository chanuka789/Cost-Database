import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { runExtraction } from "@/lib/extraction-runner";

/** Runs the extraction again for a failed upload (or re-reads one in review). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const job = await prisma.$transaction(async (tx) => {
    // Only from FAILED or REVIEW, checked in the update itself so two clicks can't start two runs.
    const claimed = await tx.boqDocument.updateMany({
      where: { id, status: { in: ["FAILED", "REVIEW"] } },
      data: { status: "PROCESSING", failureCode: null, failureMessage: null, reviewVersion: { increment: 1 }, acceptedIssues: [] },
    });
    if (claimed.count !== 1) return null;
    await audit({ userId: admin.id, action: "document.retried", entity: "document", entityId: id }, tx);
    return tx.extractionJob.create({ data: { documentId: id, step: "Waiting to start" } });
  });
  if (!job) return jsonError("This upload can't be extracted again right now.", 409);

  after(() => runExtraction(id, job.id, admin.id));
  return NextResponse.json({ ok: true });
}
