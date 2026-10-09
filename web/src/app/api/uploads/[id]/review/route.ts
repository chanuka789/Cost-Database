import { NextResponse } from "next/server";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { reviewRequestSchema } from "@/lib/review-validation";
import { applyReview, ReviewError } from "@/lib/review-service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await guardAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const parsed = reviewRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success)
    return jsonError(
      parsed.error.issues[0]?.message ?? "Invalid review request.",
      400,
    );
  const { id } = await params;
  try {
    return NextResponse.json(
      await applyReview(
        id,
        parsed.data.version,
        parsed.data.operation,
        admin.id,
      ),
    );
  } catch (e) {
    if (e instanceof ReviewError) return jsonError(e.message, e.status);
    throw e;
  }
}
