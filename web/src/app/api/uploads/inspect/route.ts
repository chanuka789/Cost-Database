import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { fileProblem } from "@/lib/upload-validation";
import { sha256 } from "@/lib/file-hash";
import { ExtractorRejected, ExtractorUnavailable, inspectFile } from "@/lib/extractor-client";
import { findSimilarProject } from "@/lib/project-match";

/**
 * First step of an upload: the admin picks a file and we read its cover so
 * the form can be pre-filled (project, BOQ date, stage), and warn straight
 * away if the same file was uploaded before.
 */
export async function POST(req: Request) {
  const admin = await guardAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("Choose a file to upload.", 400);
  const buf = Buffer.from(await file.arrayBuffer());
  const problem = fileProblem(file.name, buf.length, buf.subarray(0, 8));
  if (problem) return jsonError(problem, 400);

  const hash = sha256(buf);
  const existing = await prisma.boqDocument.findUnique({
    where: { fileSha256: hash },
    select: { id: true, title: true, createdAt: true, project: { select: { name: true } }, stage: { select: { name: true } } },
  });

  let inspected;
  try {
    inspected = await inspectFile(buf, file.name);
  } catch (e) {
    if (e instanceof ExtractorRejected) return jsonError(e.message, 422, { code: e.code });
    if (e instanceof ExtractorUnavailable) return jsonError(e.message, 503);
    throw e;
  }

  // Suggestions that match what's already in the app.
  const name = inspected.cover.project_name?.trim();
  const [projectMatch, stageMatch] = await Promise.all([
    name ? prisma.project.findMany({ select: { id: true, name: true } }).then((all) => findSimilarProject(name, all) ?? null) : null,
    inspected.cover.stage_guess
      ? prisma.stage.findFirst({ where: { name: { equals: inspected.cover.stage_guess, mode: "insensitive" }, active: true }, select: { id: true } })
      : null,
  ]);

  return NextResponse.json({
    fileType: inspected.file_type,
    pages: inspected.pages,
    cover: inspected.cover,
    suggestions: { projectId: projectMatch?.id ?? null, stageId: stageMatch?.id ?? null },
    duplicate: existing
      ? { id: existing.id, title: existing.title, project: existing.project.name, stage: existing.stage.name, uploadedAt: existing.createdAt }
      : null,
  });
}
