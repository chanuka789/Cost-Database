import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { AiError, suggestMapping, validateAiChoice } from "@/lib/ai-service";
const schema = z.object({ choice: z.string().min(1), allowFallback: z.boolean(), headers: z.array(z.string().trim().min(1).max(150)).min(2).max(50).refine(h => new Set(h).size === h.length, "Headers must be unique.") }).strict();
export async function POST(req: Request) {
  const admin = await guardAdmin(req); if (admin instanceof NextResponse) return admin;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter 2–50 unique column headers.", 400);
  try {
    await validateAiChoice(parsed.data.choice);
    return NextResponse.json(await suggestMapping(parsed.data.choice, parsed.data.allowFallback, parsed.data.headers, admin.id));
  } catch (e) { return jsonError(e instanceof AiError ? e.message : "AI mapping unavailable. Map columns manually.", 422); }
}
