import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/route-guard";
import { getCurrentUser } from "@/lib/session";
import { storage } from "@/lib/storage";

/** The original uploaded BOQ, for admins. Never served publicly. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Sign in to view this BOQ.", 401);
  const { id } = await params;

  const doc = await prisma.boqDocument.findFirst({
    where: { id, ...(user.role === "ADMIN" ? {} : { status: "PUBLISHED" }) },
    select: { fileKey: true, fileName: true, fileType: true },
  });
  if (!doc) return jsonError("Upload not found.", 404);
  const body = await storage.get(doc.fileKey);
  const type =
    doc.fileType === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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
