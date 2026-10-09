import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { storage } from "@/lib/storage";

/** The original uploaded BOQ, for admins. Never served publicly. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const doc = await prisma.boqDocument.findUnique({ where: { id }, select: { fileKey: true, fileName: true, fileType: true } });
  if (!doc) return jsonError("Upload not found.", 404);
  const body = await storage.get(doc.fileKey);
  const type = doc.fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const disposition = doc.fileType === "pdf" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
