import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
vi.mock("@/lib/route-guard", () => ({ guardAdmin: vi.fn(), jsonError: (error: string, status: number) => NextResponse.json({ error }, { status }) }));
vi.mock("@/lib/ai-service", () => ({ AiError: class extends Error {}, aiAdminData: vi.fn(), saveProvider: vi.fn(), testProvider: vi.fn(), validateAiChoice: vi.fn() }));
import { guardAdmin } from "@/lib/route-guard";
import { aiAdminData, saveProvider } from "@/lib/ai-service";
import { GET, POST } from "./route";
const request = (data: unknown) => new Request("http://localhost/api/admin/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(guardAdmin).mockResolvedValue({ id: "admin", name: "Admin", role: "ADMIN", theme: "LIGHT", email: "admin@example.invalid" }); });
it("blocks non-admin reads and mutations before touching provider data", async () => {
  vi.mocked(guardAdmin).mockResolvedValue(NextResponse.json({ error: "Only admins" }, { status: 403 }));
  expect((await GET(new Request("http://localhost/api/admin/ai"))).status).toBe(403);
  expect((await POST(request({ action: "TEST", id: "p" }))).status).toBe(403);
  expect(aiAdminData).not.toHaveBeenCalled(); expect(saveProvider).not.toHaveBeenCalled();
});
it("rejects malformed or credential-bearing endpoint configuration", async () => {
  const result = await POST(request({ action: "SAVE", provider: { name: "Example", type: "CUSTOM", baseUrl: "https://user:password@example.com", model: "model", key: "test-key", priority: 0, inputPrice: 1, outputPrice: 2, monthlyBudget: 1, dataPolicy: "Reviewed policy" } }));
  expect(result.status).toBe(400); expect(saveProvider).not.toHaveBeenCalled();
});
it("never echoes a submitted API key", async () => {
  vi.mocked(saveProvider).mockResolvedValue({ ok: true, id: "p" });
  const result = await POST(request({ action: "SAVE", provider: { name: "Example", type: "CUSTOM", baseUrl: "https://example.com/v1", model: "model", key: "synthetic-secret", priority: 0, inputPrice: 1, outputPrice: 2, monthlyBudget: 1, dataPolicy: "Reviewed policy" } }));
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ ok: true, id: "p" });
});
