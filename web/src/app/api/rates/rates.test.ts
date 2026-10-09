import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-search-service", () => ({
  searchRates: vi.fn(),
  basketRates: vi.fn(),
  rateDetail: vi.fn(),
}));
vi.mock("@/lib/rate-export", () => ({ exportRateWorkbook: vi.fn() }));
import { getCurrentUser } from "@/lib/session";
import {
  basketRates,
  searchRates,
  rateDetail,
} from "@/lib/rate-search-service";
import { exportRateWorkbook } from "@/lib/rate-export";
import { GET as search } from "./route";
import { GET as detail } from "./items/[id]/route";
import { POST as basket } from "./basket/route";
import { POST as exportRates } from "./export/route";
const actor = {
  id: "user",
  name: "User",
  email: "user@example.invalid",
  theme: "LIGHT" as const,
  role: "USER" as const,
};
const post = (body: unknown) =>
  new Request("http://localhost/api/rates/export", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => vi.clearAllMocks());
it("guards search, detail, basket and export before querying any data", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await search(new Request("http://localhost/api/rates"))).status).toBe(
    401,
  );
  expect(
    (
      await detail(new Request("http://localhost/api/rates/items/draft"), {
        params: Promise.resolve({ id: "draft" }),
      })
    ).status,
  ).toBe(401);
  expect((await basket(post({ rateIds: ["r"], currency: "SAR" }))).status).toBe(
    401,
  );
  expect(
    (await exportRates(post({ rateIds: ["r"], currency: "SAR" }))).status,
  ).toBe(401);
  expect(searchRates).not.toHaveBeenCalled();
  expect(basketRates).not.toHaveBeenCalled();
  expect(rateDetail).not.toHaveBeenCalled();
});
it("rejects bad filters and oversized or duplicate export IDs", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(actor);
  expect(
    (await search(new Request("http://localhost/api/rates?currency=USD")))
      .status,
  ).toBe(400);
  expect(
    (await exportRates(post({ rateIds: ["r", "r"], currency: "SAR" }))).status,
  ).toBe(400);
  expect(
    (
      await exportRates(
        post({
          rateIds: Array.from({ length: 501 }, (_, i) => String(i)),
          currency: "SAR",
        }),
      )
    ).status,
  ).toBe(400);
  expect(exportRateWorkbook).not.toHaveBeenCalled();
});
it("does not silently export unavailable or unpublished rates", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(actor);
  vi.mocked(basketRates).mockResolvedValue([]);
  expect(
    (await exportRates(post({ rateIds: ["draft"], currency: "AED" }))).status,
  ).toBe(409);
  expect(exportRateWorkbook).not.toHaveBeenCalled();
});
it("returns 404 for inaccessible detail without exposing metadata", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(actor);
  vi.mocked(rateDetail).mockResolvedValue(null);
  expect(
    (
      await detail(new Request("http://localhost/api/rates/items/draft"), {
        params: Promise.resolve({ id: "draft" }),
      })
    ).status,
  ).toBe(404);
});
