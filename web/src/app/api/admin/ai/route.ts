import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin, jsonError } from "@/lib/route-guard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { AiError, aiAdminData, saveProvider, testProvider, validateAiChoice } from "@/lib/ai-service";
import { aiSettingsSchema, providerSchema } from "@/lib/ai-validation";
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SAVE"), provider: providerSchema }),
  z.object({ action: z.literal("TEST"), id: z.string().min(1) }),
  z.object({ action: z.literal("REMOVE_KEY"), id: z.string().min(1) }),
  z.object({ action: z.literal("SETTINGS"), settings: aiSettingsSchema }),
]);
export async function GET(req: Request) {
  const admin = await guardAdmin(req); if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await aiAdminData(new URL(req.url).searchParams.get("month") ?? undefined));
}
export async function POST(req: Request) {
  const admin = await guardAdmin(req); if (admin instanceof NextResponse) return admin;
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Check the form.", 400);
  const op = parsed.data;
  try {
    if (op.action === "SAVE") {
      const result = await saveProvider(op.provider, admin.id);
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }
    if (op.action === "TEST") return NextResponse.json(await testProvider(op.id, admin.id));
    if (op.action === "SETTINGS") {
      if (op.settings.defaultChoice === "DEFAULT") throw new AiError("Select an actual provider as the default.");
      await validateAiChoice(op.settings.defaultChoice);
      await prisma.$transaction(async tx => {
        await tx.appSetting.upsert({ where: { key: "ai" }, create: { key: "ai", value: op.settings }, update: { value: op.settings } });
        await audit({ userId: admin.id, action: "ai.settings.changed", entity: "settings", details: op.settings }, tx);
      });
    }
    if (op.action === "REMOVE_KEY") {
      await prisma.$transaction(async tx => {
        await tx.aiProvider.update({ where: { id: op.id }, data: { enabled: false, encryptedKey: "", keyLast4: "", testFingerprint: null, testStatus: "KEY_REMOVED" } });
        await audit({ userId: admin.id, action: "ai.provider.key-removed", entity: "aiProvider", entityId: op.id }, tx);
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof AiError || e instanceof Error && e.message.startsWith("Configure AI_KEYS") ? e.message : "The AI settings could not be saved. Check the service configuration.", 400);
  }
}
