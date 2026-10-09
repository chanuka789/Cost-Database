import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
vi.mock("@/lib/route-guard", () => ({
  guardAdmin: vi.fn(),
  jsonError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));
vi.mock("@/lib/review-service", () => ({
  applyReview: vi.fn(),
  ReviewError: class extends Error {
    status = 409;
  },
}));
import { guardAdmin } from "@/lib/route-guard";
import { applyReview } from "@/lib/review-service";
import { PATCH } from "./route";
beforeEach(() => vi.clearAllMocks());
it("blocks non-admins before parsing or changing data", async () => {
  vi.mocked(guardAdmin).mockResolvedValue(
    NextResponse.json({ error: "Only admins" }, { status: 403 }),
  );
  const res = await PATCH(
    new Request("http://localhost/api/review", {
      method: "PATCH",
      body: JSON.stringify({ version: 0, operation: { action: "publish" } }),
    }),
    { params: Promise.resolve({ id: "doc" }) },
  );
  expect(res.status).toBe(403);
  expect(applyReview).not.toHaveBeenCalled();
});
it("rejects malformed review requests without database writes", async () => {
  vi.mocked(guardAdmin).mockResolvedValue({
    id: "admin",
    role: "ADMIN",
    name: "A",
    email: "a@example.invalid",
    theme: "LIGHT",
  });
  const res = await PATCH(
    new Request("http://localhost/api/review", { method: "PATCH", body: "{}" }),
    { params: Promise.resolve({ id: "doc" }) },
  );
  expect(res.status).toBe(400);
  expect(applyReview).not.toHaveBeenCalled();
});
