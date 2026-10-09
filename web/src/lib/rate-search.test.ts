import { describe, it, expect } from "vitest";
import {
  convertRate,
  escapeLike,
  exportSchema,
  parseSearch,
  searchParams,
  searchSchema,
  searchTokens,
} from "./rate-search";
import { searchWhere } from "./rate-search-service";
describe("rate search input and currency", () => {
  it("converts all fixed pegs without rounding stored values", () => {
    expect(convertRate(3.75, "SAR", "AED")).toBeCloseTo(3.6725, 8);
    expect(convertRate(3.64, "QAR", "SAR")).toBeCloseTo(3.75, 8);
    expect(
      convertRate(convertRate(101.2345, "SAR", "AED"), "AED", "SAR"),
    ).toBeCloseTo(101.2345, 8);
  });
  it("preserves distinct multi-select filters in shareable URLs", () => {
    const filters = parseSearch(
      new URLSearchParams(
        "q=paver&projects=a&projects=b&projects=a&stages=s1&stages=s2&currency=QAR&page=3",
      ),
    );
    expect(filters.projects).toEqual(["a", "b"]);
    expect(parseSearch(searchParams(filters))).toEqual(filters);
  });
  it("rejects invalid dates, reversed ranges and oversized requests", () => {
    for (const query of [
      "boqFrom=2026-02-30",
      "projectFrom=2026-10-09&projectTo=2026-01-01",
      "currency=USD",
      "page=0",
      "page=1.5",
    ])
      expect(() => parseSearch(new URLSearchParams(query))).toThrow();
    expect(searchSchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    expect(
      exportSchema.safeParse({ rateIds: ["a", "a"], currency: "SAR" }).success,
    ).toBe(false);
    expect(
      exportSchema.safeParse({ rateIds: [], currency: "SAR" }).success,
    ).toBe(false);
  });
  it("normalizes dimensions and handles punctuation without SQL syntax", () => {
    expect(searchTokens("60 mm Concrete Paver 300 × 300")).toEqual([
      "60mm",
      "concrete",
      "paver",
      "300x300",
    ]);
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\");
  });
  it("always scopes search to published documents and binds injection inputs", () => {
    const query = searchWhere(
      parseSearch(
        new URLSearchParams(
          "q=%27%3Bdrop%20table%20rates%3B--&country=%27%3BDROP&unit=m%C2%B2",
        ),
      ),
    );
    expect(query.text).toContain("d.status='PUBLISHED'");
    expect(query.text).not.toContain("DROP");
    expect(query.values).toContain("';DROP");
  });
});
