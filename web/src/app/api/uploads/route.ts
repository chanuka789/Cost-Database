import { after, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { boqDateProblem, detectFileType, fileProblem, projectDateValue, uploadSchema } from "@/lib/upload-validation";
import { sha256 } from "@/lib/file-hash";
import { boqFileKey, storage } from "@/lib/storage";
import { runExtraction } from "@/lib/extraction-runner";
import { findSimilarProject } from "@/lib/project-match";

/**
 * Creates an upload: stores the file, creates the project (if new), the BOQ
 * document and an extraction job, then starts extraction in the background.
 * The page polls GET /api/uploads/[id] for progress.
 */
export async function POST(req: Request) {
  const admin = await guardAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const rawData = form?.get("data");
  if (!(file instanceof File) || typeof rawData !== "string") return jsonError("Choose a file and fill in the form.", 400);

  let parsed;
  try {
    parsed = uploadSchema.safeParse(JSON.parse(rawData));
  } catch {
    return jsonError("The form couldn't be read. Reload the page and try again.", 400);
  }
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Check the form.", 400);
  const input = parsed.data;

  const dateProblem = boqDateProblem(input.document.boqDate);
  if (dateProblem) return jsonError(dateProblem, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const problem = fileProblem(file.name, buf.length, buf.subarray(0, 8));
  if (problem) return jsonError(problem, 400);
  const fileType = detectFileType(file.name, buf.subarray(0, 8))!;
  const hash = sha256(buf);

  const duplicate = await prisma.boqDocument.findUnique({ where: { fileSha256: hash }, select: { id: true } });
  if (duplicate) return jsonError("This exact file has already been uploaded.", 409, { documentId: duplicate.id });

  // Check the chosen lists exist (and the city belongs to the country).
  const stage = await prisma.stage.findUnique({ where: { id: input.document.stageId } });
  if (!stage?.active) return jsonError("Choose a project stage from the list.", 400);
  if (input.projectMode === "existing") {
    if (!(await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } }))) {
      return jsonError("That project no longer exists. Choose another.", 400);
    }
  } else {
    const p = input.project;
    const [city, type] = await Promise.all([
      prisma.city.findUnique({ where: { id: p.cityId } }),
      prisma.buildingType.findUnique({ where: { id: p.buildingTypeId } }),
    ]);
    if (!city || city.countryId !== p.countryId || !city.active) return jsonError("Choose a city in the selected country.", 400);
    if (!type?.active) return jsonError("Choose a building type from the list.", 400);
    const similar = findSimilarProject(p.name, await prisma.project.findMany({ select: { name: true } }));
    if (similar) {
      return jsonError(`A project called "${similar.name}" already exists. Choose it under "Existing project".`, 409);
    }
    if (p.projectNo) {
      const numbered = await prisma.project.findFirst({
        where: { projectNo: { equals: p.projectNo, mode: "insensitive" } },
        select: { name: true },
      });
      if (numbered) return jsonError(`Project number ${p.projectNo} is already used by "${numbered.name}".`, 409);
    }
  }

  // Store the file first; if saving the records fails, remove it again.
  const fileKey = boqFileKey(hash, file.name);
  await storage.put(fileKey, buf, fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  let created: { documentId: string; jobId: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      let projectId: string;
      if (input.projectMode === "new") {
        const p = input.project;
        const project = await tx.project.create({
          data: {
            name: p.name,
            projectNo: p.projectNo ?? null,
            projectDate: projectDateValue(p.projectDate, p.projectDatePrecision),
            projectDatePrecision: p.projectDatePrecision,
            client: p.client ?? null,
            consultant: p.consultant ?? null,
            countryId: p.countryId,
            cityId: p.cityId,
            buildingTypeId: p.buildingTypeId,
            createdById: admin.id,
          },
        });
        projectId = project.id;
        await audit({ userId: admin.id, action: "project.created", entity: "project", entityId: project.id, details: { name: project.name } }, tx);
      } else {
        projectId = input.projectId;
      }
      const d = input.document;
      const document = await tx.boqDocument.create({
        data: {
          projectId,
          title: d.title,
          rateType: d.rateType,
          stageId: d.stageId,
          boqDate: new Date(`${d.boqDate}T00:00:00Z`),
          currency: d.currency,
          fileKey,
          fileName: file.name,
          fileSize: buf.length,
          fileSha256: hash,
          fileType,
          uploadedById: admin.id,
        },
      });
      const job = await tx.extractionJob.create({ data: { documentId: document.id, step: "Waiting to start" } });
      await audit(
        { userId: admin.id, action: "document.uploaded", entity: "document", entityId: document.id, details: { title: d.title, file: file.name } },
        tx,
      );
      return { documentId: document.id, jobId: job.id };
    });
  } catch (e) {
    await storage.remove(fileKey).catch(() => {});
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError("This file or project was just added by someone else. Reload and check.", 409);
    }
    throw e;
  }

  after(() => runExtraction(created.documentId, created.jobId, admin.id));
  return NextResponse.json({ id: created.documentId }, { status: 201 });
}
