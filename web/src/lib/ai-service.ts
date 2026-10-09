import "server-only";
import type { AiProvider, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { encryptKey, encryptionReady, providerFingerprint } from "./ai-keys";
import { aiSettingsSchema, costFor, mappingSchema, providerSchema, sameNumbers, suggestionsSchema, type ProviderInput } from "./ai-validation";
import { fullDescription } from "./review-validation";

const resultSchema = z.object({ ok: z.boolean(), code: z.string().max(80), input_tokens: z.number().int().min(0).max(1_000_000), output_tokens: z.number().int().min(0).max(1_000_000), metered: z.boolean(), latency_ms: z.number().int().min(0), data: z.unknown() });
export class AiError extends Error {}
export async function aiSettings() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "ai" } });
  const parsed = aiSettingsSchema.safeParse(setting?.value);
  return parsed.success ? parsed.data : { enabled: false, defaultChoice: "OFF" };
}
export async function aiOptions() {
  const [settings, providers] = await Promise.all([aiSettings(), prisma.aiProvider.findMany({ where: { enabled: true }, orderBy: [{ priority: "asc" }, { id: "asc" }], select: { id: true, name: true, baseUrl: true, dataPolicy: true } })]);
  return { ...settings, providers };
}
export async function validateAiChoice(choice: string) {
  if (["OFF", "DEFAULT"].includes(choice)) return;
  if (!await prisma.aiProvider.findFirst({ where: { id: choice, enabled: true } })) throw new AiError("Choose an enabled AI provider or switch AI off.");
}
export async function uploadAiSelection(choice: string, allowFallback: boolean) {
  await validateAiChoice(choice);
  const providers = await providersFor(choice, allowFallback);
  return { aiChoice: providers[0]?.id ?? "OFF", aiRecipients: providers.map(p => ({ id: p.id, fingerprint: providerFingerprint(p) })) };
}
function publicProvider(p: AiProvider) {
  // Deliberate allowlist: neither encrypted credentials nor fingerprint leave the server.
  return { id: p.id, name: p.name, type: p.type, baseUrl: p.baseUrl, model: p.model, taskModels: p.taskModels, keyLast4: p.keyLast4, enabled: p.enabled, priority: p.priority, inputPrice: p.inputPrice, outputPrice: p.outputPrice, monthlyBudget: p.monthlyBudget, dataPolicy: p.dataPolicy, testedAt: p.testedAt?.toISOString() ?? null, testStatus: p.testStatus, testLatencyMs: p.testLatencyMs };
}
export async function aiAdminData(month = new Date().toISOString().slice(0, 7)) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) month = new Date().toISOString().slice(0, 7);
  const from = new Date(`${month}-01T00:00:00Z`);
  const to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1);
  const [providers, settings, usage] = await Promise.all([
    prisma.aiProvider.findMany({ orderBy: [{ priority: "asc" }, { id: "asc" }] }), aiSettings(),
    prisma.aiUsage.findMany({ where: { createdAt: { gte: from, lt: to } }, include: { document: { select: { title: true } }, provider: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const totals = await prisma.aiUsage.groupBy({ by: ["providerId"], where: { createdAt: { gte: from, lt: to } }, _count: true, _sum: { cost: true, reservedCost: true, inputTokens: true, outputTokens: true } });
  const uploads = await prisma.aiUsage.groupBy({ by: ["documentId"], where: { documentId: { not: null }, createdAt: { gte: from, lt: to } }, _count: true, _sum: { cost: true, reservedCost: true, inputTokens: true, outputTokens: true } });
  const titles = await prisma.boqDocument.findMany({ where: { id: { in: uploads.flatMap(u => u.documentId ? [u.documentId] : []) } }, select: { id: true, title: true } });
  return { providers: providers.map(publicProvider), settings, ready: encryptionReady(), month, uploadTotals: uploads.map(u => ({ id: u.documentId!, title: titles.find(t => t.id === u.documentId)?.title ?? "Upload", requests: u._count, input: u._sum.inputTokens ?? 0, output: u._sum.outputTokens ?? 0, cost: u._sum.cost ?? 0, reserved: u._sum.reservedCost ?? 0 })), totals: totals.map(t => ({ providerId: t.providerId, requests: t._count, cost: t._sum.cost ?? 0, reserved: t._sum.reservedCost ?? 0, input: t._sum.inputTokens ?? 0, output: t._sum.outputTokens ?? 0 })), usage: usage.map(u => ({ id: u.id, provider: u.provider.name, documentId: u.documentId, upload: u.document?.title ?? "Connection / mapping test", task: u.task, model: u.model, status: u.status, cost: u.cost, reserved: u.reservedCost, input: u.inputTokens, output: u.outputTokens, latency: u.latencyMs, code: u.errorCode, at: u.createdAt.toISOString() })) };
}
export type AiAdminData = Awaited<ReturnType<typeof aiAdminData>>;

/** Serialize reservations on the provider row; concurrent uploads cannot overspend the configured estimate. */
export async function reserveAttempt(providerId: string, task: string, model: string, prompt: string, documentId?: string, test = false) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM ai_providers WHERE id = ${providerId} FOR UPDATE`;
    const p = await tx.aiProvider.findUniqueOrThrow({ where: { id: providerId } });
    if (![p.model, ...Object.values(p.taskModels as Record<string, string>)].includes(model)) throw new AiError("MODEL_CONFIG_CHANGED");
    if (!test && (!p.enabled || p.testFingerprint !== providerFingerprint(p))) throw new AiError("DISABLED");
    const reserve = costFor(Buffer.byteLength(prompt, "utf8") + 1000, 2048, p.inputPrice, p.outputPrice);
    const from = new Date(); from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);
    const sum = await tx.aiUsage.aggregate({ where: { providerId, createdAt: { gte: from } }, _sum: { cost: true, reservedCost: true } });
    const committed = (sum._sum.cost ?? 0) + (sum._sum.reservedCost ?? 0);
    if (p.monthlyBudget !== null && (committed >= p.monthlyBudget || committed + reserve > p.monthlyBudget)) throw new AiError("BUDGET_LIMIT");
    const usage = await tx.aiUsage.create({ data: { providerId, task, model, documentId, reservedCost: reserve } });
    return { p, usage };
  });
}
export async function invoke(providerId: string, task: string, model: string, prompt: string, documentId?: string, test = false, timeout = 25) {
  if (prompt.length > 24000) throw new AiError("PROMPT_TOO_LARGE");
  const { p, usage } = await reserveAttempt(providerId, task, model, prompt, documentId, test);
  const start = Date.now();
  let result: z.infer<typeof resultSchema>;
  try {
    const base = process.env.EXTRACTOR_URL; const token = process.env.EXTRACTOR_TOKEN;
    if (!base || !token) throw new Error("Extractor not configured");
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/ai/complete`, { method: "POST", headers: { "content-type": "application/json", "x-extractor-token": token }, body: JSON.stringify({ base_url: p.baseUrl, model, encrypted_key: p.encryptedKey, prompt, timeout_seconds: timeout }), signal: AbortSignal.timeout((timeout + 5) * 1000) });
    if (!response.ok) throw new Error("Extractor unavailable");
    result = resultSchema.parse(await response.json());
  } catch {
    result = { ok: false, code: "EXTRACTOR_UNAVAILABLE", input_tokens: 0, output_tokens: 0, metered: false, latency_ms: Date.now() - start, data: null };
  }
  await prisma.aiUsage.update({ where: { id: usage.id }, data: { status: result.ok ? "SUCCEEDED" : "FAILED", inputTokens: result.input_tokens, outputTokens: result.output_tokens, latencyMs: result.latency_ms, errorCode: result.ok ? null : result.code, cost: result.metered ? costFor(result.input_tokens, result.output_tokens, p.inputPrice, p.outputPrice) : 0, reservedCost: result.metered ? 0 : usage.reservedCost } });
  return { ...result, usageId: usage.id, provider: p.name, model };
}
export async function saveProvider(input: ProviderInput, userId: string) {
  const data = providerSchema.parse(input);
  const old = data.id ? await prisma.aiProvider.findUnique({ where: { id: data.id } }) : null;
  if (data.id && !old) throw new AiError("Provider no longer exists.");
  if (!data.key && !old?.encryptedKey) throw new AiError("Enter an API key in this form.");
  const encryptedKey = data.key ? encryptKey(data.key) : old!.encryptedKey;
  const keyLast4 = data.key ? data.key.slice(-4) : old!.keyLast4;
  const { id, key: _key, ...fields } = data;
  void _key;
  const config = { ...fields, encryptedKey, keyLast4 };
  const changed = !old || providerFingerprint(config) !== old.testFingerprint;
  // Save changed credentials disabled, test their tiny synthetic request, then enable only on success.
  const p = await prisma.$transaction(async tx => {
    let saved: AiProvider;
    if (old) {
      const update = await tx.aiProvider.updateMany({ where: { id, updatedAt: old.updatedAt }, data: { ...config, enabled: changed ? false : fields.enabled } });
      if (update.count !== 1) throw new AiError("Another admin changed this provider. Refresh and try again.");
      saved = await tx.aiProvider.findUniqueOrThrow({ where: { id } });
    } else saved = await tx.aiProvider.create({ data: { ...config, enabled: false } });
    await audit({ userId, action: old ? "ai.provider.changed" : "ai.provider.added", entity: "aiProvider", entityId: saved.id, details: { name: fields.name, enabled: saved.enabled, keyChanged: !!data.key } }, tx);
    return saved;
  });
  if (changed) {
    const tested = await testProvider(p.id, userId);
    if (!tested.ok) return { ok: false, error: `Saved disabled. Connection test failed (${tested.code}). Check the endpoint, model, key and budget.`, id: p.id };
    await prisma.$transaction(async tx => {
      const enabled = await tx.aiProvider.updateMany({ where: { id: p.id, updatedAt: tested.updatedAt }, data: { enabled: fields.enabled } });
      if (enabled.count !== 1) throw new AiError("Provider changed during testing. Refresh and test again.");
      await audit({ userId, action: "ai.provider.enabled-after-test", entity: "aiProvider", entityId: p.id, details: { enabled: fields.enabled } }, tx);
    });
  }
  return { ok: true, id: p.id };
}
export async function testProvider(id: string, userId: string) {
  const p = await prisma.aiProvider.findUniqueOrThrow({ where: { id } });
  const taskModels = p.taskModels as Record<string, string>;
  let ok = true, code = "OK", latency = 0;
  for (const model of new Set([p.model, ...Object.values(taskModels).filter(Boolean)])) {
    try {
      const r = await invoke(id, "TEST", model, 'Return exactly {"ok":true}. This is a connection test using no client data.', undefined, true);
      latency += r.latency_ms;
      if (!r.ok || !z.object({ ok: z.literal(true) }).strict().safeParse(r.data).success) { ok = false; code = r.ok ? "INVALID_JSON" : r.code; break; }
    } catch (e) { ok = false; code = e instanceof AiError ? e.message : "UNAVAILABLE"; break; }
  }
  const updated = await prisma.$transaction(async tx => {
    const update = await tx.aiProvider.updateMany({ where: { id, updatedAt: p.updatedAt }, data: { testFingerprint: ok ? providerFingerprint(p) : null, testStatus: ok ? "PASSED" : code, testedAt: new Date(), testLatencyMs: latency, ...(!ok ? { enabled: false } : {}) } });
    await audit({ userId, action: "ai.provider.tested", entity: "aiProvider", entityId: id, details: { ok, code, latencyMs: latency } }, tx);
    return update.count ? await tx.aiProvider.findUniqueOrThrow({ where: { id } }) : null;
  });
  return { ok: ok && !!updated, code: updated ? code : "CONFIG_CHANGED", latency, updatedAt: updated?.updatedAt };
}
async function providersFor(choice: string, allowFallback: boolean) {
  const settings = await aiSettings();
  if (!settings.enabled || choice === "OFF") return [];
  const primary = choice === "DEFAULT" ? settings.defaultChoice : choice;
  if (primary === "OFF" || primary === "DEFAULT") return [];
  const all = await prisma.aiProvider.findMany({ where: { enabled: true }, orderBy: [{ priority: "asc" }, { id: "asc" }] });
  const first = all.find(p => p.id === primary);
  // A deleted/disabled explicit provider must never silently send data elsewhere.
  return first ? [first, ...(allowFallback ? all.filter(p => p.id !== primary).slice(0, 2) : [])] : [];
}
async function withFallback(choice: string, allowFallback: boolean, task: string, prompt: string, schema: z.ZodType, documentId?: string, deadline = Date.now() + 180000, recipients?: unknown) {
  let last = "NO_PROVIDER";
  const snapshot = z.array(z.object({ id: z.string(), fingerprint: z.string() })).safeParse(recipients);
  const available = await providersFor(choice, allowFallback);
  for (const p of (recipients === undefined ? available : available.filter(p => snapshot.success && snapshot.data.some(s => s.id === p.id && s.fingerprint === providerFingerprint(p))))) {
    for (let attempt = 0; attempt < 2 && Date.now() < deadline - 6000; attempt++) {
      // Honour the global kill switch between requests, including retries.
      if (!(await aiSettings()).enabled) throw new AiError("AI_DISABLED");
      const model = (p.taskModels as Record<string, string>)[task] || p.model;
      try {
        const r = await invoke(p.id, task, model, prompt, documentId, false, Math.max(1, Math.min(25, (deadline - Date.now() - 5000) / 1000)));
        const parsed = schema.safeParse(r.data);
        if (r.ok && parsed.success) return { ...r, data: parsed.data };
        last = r.ok ? "INVALID_JSON" : r.code;
        if (r.ok) await prisma.aiUsage.update({ where: { id: r.usageId }, data: { status: "REJECTED", errorCode: "INVALID_JSON" } });
        if (["HTTP_401", "HTTP_403", "HTTP_400", "INVALID_RESPONSE_OR_CONFIGURATION"].includes(last)) break;
      } catch (e) { last = e instanceof AiError ? e.message : "UNAVAILABLE"; break; }
    }
  }
  throw new AiError(last);
}

/** AI can only store proposals. Numeric fields never enter the prompt or write path. */
export async function runAiReview(documentId: string, userId: string) {
  const doc = await prisma.boqDocument.findUniqueOrThrow({ where: { id: documentId }, include: { items: { orderBy: { sortOrder: "asc" }, include: { mainDescription: { include: { section: true } } } } } });
  if (doc.aiChoice === "OFF") return;
  const deadline = Date.now() + 8 * 60_000;
  const allGroups = await prisma.mainDescription.findMany({ where: { section: { bill: { documentId } } }, include: { section: true } });
  const groups = new Map(allGroups.map(g => [g.id, g]));
  let stored = 0, failed = 0, finished = 0;
  await prisma.boqDocument.update({ where: { id: documentId }, data: { aiStatus: "RUNNING", aiMessage: "Preparing review suggestions" } });
  try {
    for (let offset = 0; offset < doc.items.length && Date.now() < deadline - 6000; offset += 15) {
      const batch = doc.items.slice(offset, offset + 15);
      for (const task of ["TEXT", "TRADE", "LINK"] as const) {
        if (Date.now() > deadline - 6000) { failed++; break; }
        const eligible = task === "LINK" ? batch.filter(i => JSON.stringify(i.flags).match(/UNCERTAIN|ORPHAN|MISSING_MAIN|LINK/i)) : batch;
        if (!eligible.length) continue;
        const source = eligible.map(i => ({ itemId: i.id, text: i.description, groupId: i.mainDescriptionId }));
        const context = [...new Set(eligible.map(i => i.mainDescriptionId))].map(id => groups.get(id)!).map(g => ({ id: g.id, main: g.text, heading: g.section.heading, parent: g.section.parentHeading }));
        const nearby = task === "LINK" ? [...groups.values()].filter(g => g.pageFrom <= Math.max(...eligible.map(i => i.page)) + 1 && g.pageTo >= Math.min(...eligible.map(i => i.page)) - 1).map(g => ({ id: g.id, text: g.text, heading: g.section.heading })) : [];
        const instruction = task === "TEXT" ? "Propose only spelling or broken-text fixes to item text; preserve meaning and every numeric token in order. Omit already-correct items." : task === "TRADE" ? "Suggest a concise construction trade category for each item, based on context. Do not invent numbers." : "Check uncertain main-description links. Propose a supplied nearby group ID only when context strongly supports moving the item; otherwise omit it.";
        const prompt = `${instruction}\nReturn exactly {"suggestions":[{"itemId":"provided ID","kind":"${task}","proposed":"${task === "LINK" ? "group ID" : "text"}","reason":"brief explanation"}]}.\nBOQ data: ${JSON.stringify({ items: source, context, groups: nearby })}`;
        const safeResponse = suggestionsSchema.superRefine((data, ctx) => {
          const ids = new Set<string>();
          for (const s of data.suggestions) {
            const i = eligible.find(i => i.id === s.itemId);
            if (!i || ids.has(s.itemId) || s.kind !== task ||
                (task === "TEXT" && !sameNumbers(i?.description ?? "", s.proposed)) ||
                (task === "TRADE" && (s.proposed.length > 80 || /\d/.test(s.proposed))) ||
                (task === "LINK" && !nearby.some(g => g.id === s.proposed)))
              ctx.addIssue({ code: "custom", message: "Unsafe or out-of-scope suggestion" });
            ids.add(s.itemId);
          }
          if (task === "TRADE" && ids.size !== eligible.length) ctx.addIssue({ code: "custom", message: "Missing trade suggestions" });
        });
        try {
          const r = await withFallback(doc.aiChoice, doc.aiAllowFallback, task, prompt, safeResponse, documentId, deadline, doc.aiRecipients);
          const suggestions = suggestionsSchema.parse(r.data).suggestions;
          const seen = new Set<string>();
          const proposals = suggestions.map(s => {
            const i = eligible.find(i => i.id === s.itemId);
            if (!i || s.kind !== task || seen.has(i.id)) throw new AiError("UNSAFE_PROPOSAL");
            seen.add(i.id);
            const original = task === "TEXT" ? i.description : task === "LINK" ? i.mainDescriptionId : (i.trade ?? "");
            if (task === "TEXT" && !sameNumbers(original, s.proposed)) throw new AiError("NUMBERS_CHANGED");
            if (task === "TRADE" && (s.proposed.length > 80 || /\d/.test(s.proposed))) throw new AiError("UNSAFE_TRADE");
            if (task === "LINK" && !nearby.some(g => g.id === s.proposed)) throw new AiError("UNKNOWN_GROUP");
            return { documentId, itemId: i.id, kind: task, original, proposed: s.proposed, reason: s.reason, providerName: r.provider, model: r.model };
          }).filter(s => s.original !== s.proposed);
          await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM boq_documents WHERE id = ${documentId} FOR UPDATE`;
            const current = await tx.boqDocument.findUniqueOrThrow({ where: { id: documentId } });
            if (current.status !== "REVIEW" || current.reviewVersion !== doc.reviewVersion) throw new AiError("REVIEW_CHANGED");
            if (proposals.length) await tx.aiSuggestion.createMany({ data: proposals });
          });
          stored += proposals.length;
        } catch (e) {
          failed++;
          if (e instanceof AiError && ["NO_PROVIDER", "AI_DISABLED", "REVIEW_CHANGED"].includes(e.message)) throw e;
        }
      }
      finished += batch.length;
    }
    await prisma.boqDocument.update({ where: { id: documentId }, data: { aiStatus: failed || finished < doc.items.length ? "PARTIAL" : "DONE", aiMessage: `${stored} suggestions. Processed ${finished}/${doc.items.length} items${failed ? `; ${failed} task batches unavailable or rejected` : ""}. Review each suggestion before checking items.` } });
  } catch (e) {
    await prisma.boqDocument.update({ where: { id: documentId }, data: { aiStatus: stored ? "PARTIAL" : "SKIPPED", aiMessage: `${stored} suggestions. AI stopped (${e instanceof AiError ? e.message : "UNAVAILABLE"}). Rule-based extraction remains available.` } });
  }
  await audit({ userId, action: "ai.document.reviewed", entity: "document", entityId: documentId, details: { stored, failed, finished } });
}

export async function suggestMapping(choice: string, allowFallback: boolean, headers: string[], userId: string) {
  const prompt = `Suggest column mapping for these untrusted BOQ column headers: ${JSON.stringify(headers)}. Use only an exact supplied header or null. Return {"columns":{"reference":null,"description":"header","unit":null,"quantity":null,"rate":null,"amount":null},"reason":"explanation"}. Do not infer or alter cell values.`;
  const r = await withFallback(choice, allowFallback, "MAPPING", prompt, mappingSchema);
  const parsed = mappingSchema.parse(r.data);
  const selected = Object.values(parsed.columns).filter(v => v !== null);
  if (selected.some(v => !headers.includes(v)) || new Set(selected).size !== selected.length) throw new AiError("Invalid or duplicate column mapping returned. Map the columns manually.");
  await audit({ userId, action: "ai.mapping.suggested", entity: "aiProvider", details: { provider: r.provider, model: r.model } });
  return { ...parsed, provider: r.provider };
}

export async function applyAiSuggestion(tx: Prisma.TransactionClient, documentId: string, suggestionId: string, accept: boolean, userId: string) {
  const s = await tx.aiSuggestion.findFirst({ where: { id: suggestionId, documentId, status: "PENDING" } });
  if (!s) throw new AiError("Suggestion was already reviewed or no longer exists.");
  if (accept) {
    const i = await tx.boqItem.findFirst({ where: { id: s.itemId, documentId }, include: { mainDescription: { include: { section: true } } } });
    if (!i) throw new AiError("Suggestion item no longer exists.");
    const original = s.kind === "TEXT" ? i.description : s.kind === "TRADE" ? (i.trade ?? "") : i.mainDescriptionId;
    if (original !== s.original) throw new AiError("Item changed since this suggestion. Reject it and review the current text.");
    const data: Prisma.BoqItemUpdateInput = { aiTouched: true, checkedAt: null, checkedById: null };
    if (s.kind === "TEXT") {
      if (!sameNumbers(i.description, s.proposed)) throw new AiError("Suggestion changes numbers.");
      data.description = s.proposed;
      const m = i.mainDescription;
      data.fullDescription = fullDescription(m.section.parentHeading, m.section.heading, m.text, s.proposed);
    } else if (s.kind === "TRADE") data.trade = s.proposed;
    else if (s.kind === "LINK") {
      const target = await tx.mainDescription.findFirst({ where: { id: s.proposed, section: { bill: { documentId } } }, include: { section: true } });
      if (!target) throw new AiError("Target group no longer exists.");
      data.mainDescription = { connect: { id: target.id } };
      data.fullDescription = fullDescription(target.section.parentHeading, target.section.heading, target.text, i.description);
      data.acceptedFlags = [];
    } else throw new AiError("Unsupported suggestion.");
    await tx.boqItem.update({ where: { id: i.id }, data });
  }
  await tx.aiSuggestion.update({ where: { id: s.id }, data: { status: accept ? "ACCEPTED" : "REJECTED", reviewedAt: new Date(), reviewedById: userId } });
}
