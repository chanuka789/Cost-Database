import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { boqDocument: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/storage", () => ({ storage: { get: vi.fn() } }));
vi.mock("@/lib/route-guard", async () => {
  const { NextResponse } = await import("next/server");
  return {
    jsonError: (error: string, status: number) =>
      NextResponse.json({ error }, { status }),
  };
});
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { GET } from "./route";
beforeEach(() => vi.clearAllMocks());
it("refuses unauthenticated file access", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect(
    (
      await GET(new Request("http://localhost/api/file"), {
        params: Promise.resolve({ id: "doc" }),
      })
    ).status,
  ).toBe(401);
  expect(storage.get).not.toHaveBeenCalled();
});
it("restricts ordinary users to published source files", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "user",
    role: "USER",
    name: "U",
    email: "u@example.invalid",
    theme: "LIGHT",
  });
  vi.mocked(prisma.boqDocument.findFirst).mockResolvedValue(null);
  expect(
    (
      await GET(new Request("http://localhost/api/file"), {
        params: Promise.resolve({ id: "draft" }),
      })
    ).status,
  ).toBe(404);
  expect(prisma.boqDocument.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "draft", status: "PUBLISHED" } }),
  );
  expect(storage.get).not.toHaveBeenCalled();
});
