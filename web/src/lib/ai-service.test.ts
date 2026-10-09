import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./storage", () => ({ storage: { get: vi.fn(async () => Buffer.from("synthetic")) } }));
vi.mock("./extractor-client", async () => ({ ...await vi.importActual<typeof import("./extractor-client")>("./extractor-client"), extractFile: vi.fn() }));
import { prisma } from "./prisma";
import { aiAdminData, reserveAttempt, runAiReview, saveProvider, suggestMapping, uploadAiSelection } from "./ai-service";
import { encryptKey, providerFingerprint } from "./ai-keys";
import { applyReview } from "./review-service";
import { runExtraction } from "./extraction-runner";
import { extractFile } from "./extractor-client";
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl && !["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname)) throw new Error("AI tests require a local database.");
if (testUrl) process.env.DATABASE_URL = testUrl;
describe.skipIf(!testUrl)("AI transaction and fallback integration", () => {
  let uid: string, pid: string, did: string, iid: string, gid: string, target: string;
  const providers: string[] = [];
  let oldSetting: unknown, master: string | undefined;
  const fetchMock = vi.fn();
  const envelope = (data: unknown, code = "OK") => Response.json({ ok: code === "OK", code, data, metered: code === "OK", input_tokens: code === "OK" ? 120 : 0, output_tokens: code === "OK" ? 40 : 0, latency_ms: 5 });
  async function execute(operation: Parameters<typeof applyReview>[2]) { const d = await prisma.boqDocument.findUniqueOrThrow({ where: { id: did } }); return applyReview(did, d.reviewVersion, operation, uid); }
  beforeAll(async () => {
    master = process.env.AI_KEYS_ENCRYPTION_KEY;
    process.env.AI_KEYS_ENCRYPTION_KEY = Buffer.alloc(32, 97).toString("base64");
    const setting = await prisma.appSetting.findUnique({ where: { key: "ai" } }); oldSetting = setting?.value;
    const [country, city, type, stage] = await Promise.all([prisma.country.findFirstOrThrow(), prisma.city.findFirstOrThrow(), prisma.buildingType.findFirstOrThrow(), prisma.stage.findFirstOrThrow()]);
    uid = (await prisma.user.create({ data: { name: "AI integration", email: `ai-${Date.now()}@example.invalid`, role: "ADMIN", status: "ACTIVE" } })).id;
    pid = (await prisma.project.create({ data: { name: `AI integration ${Date.now()}`, projectDate: new Date("2026-01-01"), countryId: country.id, cityId: city.id, buildingTypeId: type.id, createdById: uid } })).id;
    did = (await prisma.boqDocument.create({ data: { title: "AI synthetic", projectId: pid, rateType: "PTE", stageId: stage.id, boqDate: new Date("2026-01-01"), currency: "SAR", status: "REVIEW", fileKey: "test", fileName: "test.xlsx", fileSha256: `ai-${Date.now()}`, fileSize: 100, fileType: "xlsx", uploadedById: uid, issues: [] } })).id;
    const bill = await prisma.bill.create({ data: { documentId: did, billNo: "01", title: "Paving", sortOrder: 0 } });
    const section = await prisma.section.create({ data: { billId: bill.id, heading: "Paving", sortOrder: 0 } });
    gid = (await prisma.mainDescription.create({ data: { sectionId: section.id, text: "Concrete paving", pageFrom: 1, pageTo: 1, sortOrder: 0 } })).id;
    target = (await prisma.mainDescription.create({ data: { sectionId: section.id, text: "Concrete pavers for paths", pageFrom: 1, pageTo: 1, sortOrder: 1 } })).id;
    iid = (await prisma.boqItem.create({ data: { documentId: did, mainDescriptionId: gid, itemRef: "A", description: "60mm concrete pavrs", fullDescription: "Paving — Concrete paving — 60mm concrete pavrs", qty: "12.5", unit: "m2", page: 1, sortOrder: 0, flags: [{ code: "UNCERTAIN_LINK", severity: "warning", message: "Review grouping" }] } })).id;
    await prisma.rate.create({ data: { itemId: iid, rate: "8.75", amount: "109.38", currency: "SAR" } });
    for (let n = 0; n < 2; n++) {
      const p = await prisma.aiProvider.create({ data: { name: `AI integration ${n}`, type: "CUSTOM", baseUrl: `https://provider${n}.example.invalid/v1`, model: `model${n}`, encryptedKey: encryptKey("synthetic-secret-1234"), keyLast4: "1234", priority: n, inputPrice: 1, outputPrice: 2, monthlyBudget: 1, dataPolicy: "Synthetic test provider" } });
      await prisma.aiProvider.update({ where: { id: p.id }, data: { enabled: true, testFingerprint: providerFingerprint(p), testStatus: "PASSED" } });
      providers.push(p.id);
    }
  });
  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
    process.env.EXTRACTOR_URL = "http://localhost:8100"; process.env.EXTRACTOR_TOKEN = "test-token";
    await prisma.aiSuggestion.deleteMany({ where: { documentId: did } });
    await prisma.aiUsage.deleteMany({ where: { providerId: { in: providers } } });
    await prisma.aiProvider.updateMany({ where: { id: { in: providers } }, data: { monthlyBudget: 1, enabled: true } });
    const recipients = await prisma.aiProvider.findMany({ where: { id: { in: providers } } });
    await prisma.boqDocument.update({ where: { id: did }, data: { status: "REVIEW", aiStatus: "QUEUED", aiChoice: providers[0], aiAllowFallback: true, aiRecipients: recipients.map(p => ({ id: p.id, fingerprint: providerFingerprint(p) })), reviewVersion: 0 } });
    await prisma.boqItem.update({ where: { id: iid }, data: { description: "60mm concrete pavrs", mainDescriptionId: gid, trade: null, aiTouched: false, checkedAt: null } });
    await prisma.appSetting.upsert({ where: { key: "ai" }, create: { key: "ai", value: { enabled: true, defaultChoice: providers[0] } }, update: { value: { enabled: true, defaultChoice: providers[0] } } });
    fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      expect(body).not.toHaveProperty("qty"); expect(body.prompt).not.toContain("109.38"); expect(body.prompt).not.toContain("8.75");
      expect(body.encrypted_key).not.toContain("synthetic-secret");
      const kind = body.prompt.startsWith("Propose") ? "TEXT" : body.prompt.startsWith("Suggest a concise") ? "TRADE" : "LINK";
      return envelope({ suggestions: [{ itemId: iid, kind, proposed: kind === "TEXT" ? "60mm concrete pavers" : kind === "TRADE" ? "External works" : target, reason: "Check source context" }] });
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  afterAll(async () => {
    await prisma.boqDocument.deleteMany({ where: { id: did } });
    await prisma.project.deleteMany({ where: { id: pid } });
    await prisma.aiUsage.deleteMany({ where: { providerId: { in: providers } } });
    await prisma.aiProvider.deleteMany({ where: { id: { in: providers } } });
    await prisma.auditLog.deleteMany({ where: { userId: uid } });
    await prisma.user.deleteMany({ where: { id: uid } });
    if (oldSetting === undefined) await prisma.appSetting.deleteMany({ where: { key: "ai" } });
    else await prisma.appSetting.update({ where: { key: "ai" }, data: { value: oldSetting as object } });
    if (master === undefined) delete process.env.AI_KEYS_ENCRYPTION_KEY; else process.env.AI_KEYS_ENCRYPTION_KEY = master;
    await prisma.$disconnect();
  });
  it("AI off sends nothing", async () => { await prisma.boqDocument.update({ where: { id: did }, data: { aiChoice: "OFF", aiStatus: "OFF" } }); await runAiReview(did, uid); expect(fetchMock).not.toHaveBeenCalled(); });
  it("stores separate proposals, gates publication and preserves all numeric values", async () => {
    await runAiReview(did, uid);
    const proposals = await prisma.aiSuggestion.findMany({ where: { documentId: did } }); expect(proposals).toHaveLength(3);
    expect((await prisma.boqItem.findUniqueOrThrow({ where: { id: iid } })).description).toBe("60mm concrete pavrs");
    await expect(execute({ action: "check", itemIds: [iid], checked: true })).rejects.toThrow("Accept or reject");
    await expect(execute({ action: "publish" })).rejects.toThrow("Review all AI");
    for (const s of proposals) await execute({ action: "aiSuggestion", suggestionId: s.id, accept: true });
    const i = await prisma.boqItem.findUniqueOrThrow({ where: { id: iid }, include: { rates: true } });
    expect(i.description).toBe("60mm concrete pavers"); expect(i.trade).toBe("External works"); expect(i.mainDescriptionId).toBe(target); expect(i.aiTouched).toBe(true); expect(i.checkedAt).toBeNull();
    expect([i.qty?.toString(), i.rates[0].rate?.toString(), i.rates[0].amount?.toString()]).toEqual(["12.5", "8.75", "109.38"]);
    await execute({ action: "check", itemIds: [iid], checked: true }); await execute({ action: "publish" });
    expect((await prisma.boqDocument.findUniqueOrThrow({ where: { id: did } })).status).toBe("PUBLISHED");
  });
  it("rejects unsafe text and never changes dimensions", async () => {
    fetchMock.mockImplementation(async () => envelope({ suggestions: [{ itemId: iid, kind: "TEXT", proposed: "80mm concrete pavers", reason: "Changed dimension" }] }));
    await runAiReview(did, uid);
    expect(await prisma.aiSuggestion.count({ where: { documentId: did } })).toBe(0);
    expect((await prisma.boqItem.findUniqueOrThrow({ where: { id: iid } })).description).toBe("60mm concrete pavrs");
  });
  it("uses opted-in fallback, but never falls back without consent", async () => {
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, options) => JSON.parse(options.body).model === "model0" ? envelope(null, "HTTP_401") : normal(url, options));
    await runAiReview(did, uid);
    expect(await prisma.aiSuggestion.count({ where: { documentId: did } })).toBe(3);
    expect(await prisma.aiUsage.count({ where: { providerId: providers[1] } })).toBe(3);
    await prisma.aiSuggestion.deleteMany({ where: { documentId: did } });
    await prisma.aiUsage.deleteMany({ where: { providerId: { in: providers } } });
    await prisma.boqDocument.update({ where: { id: did }, data: { aiAllowFallback: false } });
    await runAiReview(did, uid);
    expect(await prisma.aiUsage.count({ where: { providerId: providers[1] } })).toBe(0);
    expect((await prisma.boqDocument.findUniqueOrThrow({ where: { id: did } })).status).toBe("REVIEW");
  });
  it("all providers down leaves extraction reviewable and holds uncertain costs", async () => {
    fetchMock.mockRejectedValue(new Error("network failed")); await runAiReview(did, uid);
    const d = await prisma.boqDocument.findUniqueOrThrow({ where: { id: did } }); expect(d.status).toBe("REVIEW"); expect(d.aiStatus).toBe("PARTIAL");
    const usage = await prisma.aiUsage.findMany({ where: { documentId: did } }); expect(usage.length).toBeGreaterThan(0); expect(usage.every(u => u.status === "FAILED" && u.reservedCost > 0)).toBe(true);
  });
  it("serializes budget reservations across simultaneous requests", async () => {
    await prisma.aiProvider.update({ where: { id: providers[0] }, data: { monthlyBudget: .006 } });
    const results = await Promise.allSettled([reserveAttempt(providers[0], "TEXT", "model0", "test"), reserveAttempt(providers[0], "TEXT", "model0", "test")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });
  it("resolves default and snapshots recipients at upload time", async () => { const result = await uploadAiSelection("DEFAULT", true); expect(result.aiChoice).toBe(providers[0]); expect(result.aiRecipients).toHaveLength(2); });
  it("rejects stale proposals after a manual edit", async () => {
    await runAiReview(did, uid);
    const s = await prisma.aiSuggestion.findFirstOrThrow({ where: { documentId: did, kind: "TEXT" } });
    await prisma.boqItem.update({ where: { id: iid }, data: { description: "60mm corrected manually" } });
    await expect(execute({ action: "aiSuggestion", suggestionId: s.id, accept: true })).rejects.toThrow("Item changed");
    await execute({ action: "aiSuggestion", suggestionId: s.id, accept: false });
  });
  it("sanitizes admin results and provides model/token/cost usage", async () => {
    await runAiReview(did, uid); const data = await aiAdminData();
    expect(JSON.stringify(data)).not.toContain("encryptedKey"); expect(JSON.stringify(data)).not.toContain("synthetic-secret");
    expect(data.totals.find(t => t.providerId === providers[0])?.requests).toBe(3);
    expect(data.totals.find(t => t.providerId === providers[0])?.cost).toBeCloseTo(.0006);
  });
  it("maps only supplied unique header labels", async () => {
    fetchMock.mockImplementation(async () => envelope({ columns: { reference: "Code", description: "Work", quantity: "Count", unit: "Measure", rate: "Cost", amount: "Extension" }, reason: "Header aliases" }));
    const headers = ["Code", "Work", "Count", "Measure", "Cost", "Extension"];
    const result = await suggestMapping(providers[0], false, headers, uid); expect(result.columns.quantity).toBe("Count");
    await expect(suggestMapping(providers[0], false, ["Other", "Headers"], uid)).rejects.toThrow("Invalid or duplicate");
  });
  it("tests changed credentials before enabling and audits without keys", async () => {
    fetchMock.mockResolvedValue(envelope({ ok: true }));
    const p = await prisma.aiProvider.findUniqueOrThrow({ where: { id: providers[0] } });
    const result = await saveProvider({ id: p.id, name: p.name, type: "CUSTOM", baseUrl: p.baseUrl, model: "updated-model", taskModels: {}, key: "new-synthetic-key-5678", priority: 0, enabled: true, inputPrice: 1, outputPrice: 2, monthlyBudget: 1, dataPolicy: p.dataPolicy }, uid);
    expect(result.ok).toBe(true);
    const updated = await prisma.aiProvider.findUniqueOrThrow({ where: { id: p.id } }); expect(updated.enabled).toBe(true); expect(updated.keyLast4).toBe("5678");
    const logs = await prisma.auditLog.findMany({ where: { userId: uid } }); expect(JSON.stringify(logs)).not.toContain("new-synthetic-key");
    // Restore test configuration for any later randomized ordering.
    await prisma.aiProvider.update({ where: { id: p.id }, data: { model: "model0", encryptedKey: p.encryptedKey, testFingerprint: providerFingerprint(p), keyLast4: "1234" } });
  });
  it("re-extraction retains original AI history and supersedes pending proposals", async () => {
    await runAiReview(did, uid);
    const original = await prisma.aiSuggestion.findFirstOrThrow({ where: { documentId: did, kind: "TEXT" } });
    await execute({ action: "aiSuggestion", suggestionId: original.id, accept: true });
    await prisma.boqDocument.update({ where: { id: did }, data: { aiChoice: "OFF", status: "PROCESSING" } });
    const job = await prisma.extractionJob.create({ data: { documentId: did } });
    vi.mocked(extractFile).mockResolvedValue({ parser: "xlsx-columns", version: "1", file_type: "xlsx", cover: { project_name: null, boq_date: null, stage_text: null, stage_guess: null }, issues: [], page_totals: [], stats: { pages: 1, items: 1, priced_items: 1, bills: 1 }, bills: [{ bill_no: "01", title: "Paving", sections: [{ heading: "Paving", parent_heading: null, main_descriptions: [{ text: "Concrete", page_from: 1, page_to: 1, items: [{ ref: "A", description: "60mm concrete pavrs", full_description: "Paving — Concrete — 60mm concrete pavrs", page: 1, unit: "m2", unit_raw: "m2", qty: "12.5", rate: "8.75", amount: "109.38", rate_note: null, flags: [] }] }] }] }] });
    await runExtraction(did, job.id, uid);
    const d = await prisma.boqDocument.findUniqueOrThrow({ where: { id: did } });
    expect(d.status).toBe("REVIEW"); expect(d.aiStatus).toBe("OFF");
    const history = await prisma.aiSuggestion.findMany({ where: { documentId: did } });
    expect(history).toHaveLength(3);
    expect(history.find(s => s.id === original.id)).toMatchObject({ original: "60mm concrete pavrs", proposed: "60mm concrete pavers", status: "ACCEPTED" });
    expect(history.filter(s => s.status === "SUPERSEDED")).toHaveLength(2);
  });
});
