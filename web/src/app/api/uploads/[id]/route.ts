import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { storage } from "@/lib/storage";
import { failStaleJobs } from "@/lib/extraction-runner";
import { lockDocument, ReviewError } from "@/lib/review-service";

type Ctx = { params: Promise<{ id: string }> };

/** Progress of an upload, polled by the upload page while it extracts. */
export async function GET(req: Request, { params }: Ctx) {
  const admin = await guardAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  await failStaleJobs(id);
  const doc = await prisma.boqDocument.findUnique({
    where: { id },
    select: {
      status: true,
      itemCount: true,
      errorCount: true,
      warningCount: true,
      failureMessage: true,
      jobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, step: true, startedAt: true } },
    },
  });
  if (!doc) return jsonError("Upload not found.", 404);
  return NextResponse.json({ ...doc, job: doc.jobs[0] ?? null, jobs: undefined });
}

/** Deletes an upload that isn't published, with everything extracted from it. */
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await guardAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const doc = await prisma.boqDocument.findUnique({ where: { id }, select: { status: true, fileKey: true, title: true, projectId: true } });
  if (!doc) return jsonError("Upload not found.", 404);
  if (doc.status === "PUBLISHED") return jsonError("Published BOQs can't be deleted here.", 409);
  if (doc.status === "PROCESSING") return jsonError("Wait for the extraction to finish before deleting.", 409);

  try { await prisma.$transaction(async (tx) => {
    const current = await lockDocument(tx, id);
    if (current.status === "PUBLISHED" || current.status === "PROCESSING") throw new ReviewError("This BOQ can no longer be deleted.");
    await tx.boqDocument.delete({ where: { id } });
    await audit({ userId: admin.id, action: "document.deleted", entity: "document", entityId: id, details: { title: doc.title } }, tx);
  }); } catch (e) { if (e instanceof ReviewError) return jsonError(e.message, e.status); throw e; }
  await storage.remove(doc.fileKey).catch((e) => console.error("Couldn't remove stored file", doc.fileKey, e));
  return NextResponse.json({ ok: true });
}
