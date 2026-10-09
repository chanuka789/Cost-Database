import { describe, expect, it } from "vitest";
import { validateItem } from "./review-checks";
import {
  flagKey,
  fullDescription,
  reviewRequestSchema,
  unresolved,
} from "./review-validation";
const item = {
  description: "Pavers",
  unit: "m²",
  qty: "10",
  rate: "12.34",
  amount: "123.40",
  rateNote: null,
};
describe("review checks", () => {
  it("rechecks arithmetic with decimal precision", () => {
    expect(
      validateItem(item, []).filter((f) => f.severity === "error"),
    ).toEqual([]);
    expect(
      validateItem({ ...item, amount: "100" }, []).some(
        (f) => f.code === "AMOUNT_MISMATCH",
      ),
    ).toBe(true);
    expect(
      validateItem({ ...item, qty: "0.1", rate: "0.2", amount: "0.02" }, []),
    ).toEqual([]);
  });
  it("removes repaired errors while retaining source warnings", () => {
    const flags = validateItem(item, [
      { code: "EMPTY_DESCRIPTION", severity: "error", message: "Missing" },
      { code: "REF_GAP", severity: "warning", message: "Gap" },
    ]);
    expect(flags.map((f) => f.code)).toEqual(["REF_GAP"]);
  });
  it("does not mistake zero for missing or auto-fill amounts", () => {
    expect(
      validateItem({ ...item, qty: "0", rate: "0", amount: "0" }, []),
    ).toEqual([]);
    expect(
      validateItem({ ...item, amount: null }, []).map((f) => f.code),
    ).toContain("AMOUNT_MISSING");
  });
  it("only accepts the exact check, including its source page", () => {
    const flag = {
      code: "PAGE_TOTAL_MISMATCH",
      severity: "error" as const,
      message: "Mismatch",
      page: 1,
    };
    const accepted = [
      {
        key: flagKey(flag),
        reason: "Verified source",
        userId: "admin",
        at: "now",
      },
    ];
    expect(unresolved([flag], accepted)).toEqual([]);
    expect(
      unresolved([{ ...flag, message: "Changed" }], accepted),
    ).toHaveLength(1);
    expect(flagKey({ ...flag, page: 2 })).not.toBe(flagKey(flag));
  });
  it("requires a review version and an acceptance reason", () => {
    expect(
      reviewRequestSchema.safeParse({
        version: 0,
        operation: { action: "accept", key: "x", reason: "" },
      }).success,
    ).toBe(false);
    expect(
      reviewRequestSchema.safeParse({ operation: { action: "publish" } })
        .success,
    ).toBe(false);
  });
  it("rejects duplicate or excessively large bulk selections", () => {
    expect(
      reviewRequestSchema.safeParse({
        version: 0,
        operation: { action: "check", itemIds: ["a", "a"], checked: true },
      }).success,
    ).toBe(false);
    expect(
      reviewRequestSchema.safeParse({
        version: 0,
        operation: {
          action: "check",
          itemIds: Array.from({ length: 501 }, (_, i) => String(i)),
          checked: true,
        },
      }).success,
    ).toBe(false);
  });
  it("rejects values that exceed database numeric precision", () => {
    const operation = {
      action: "item",
      itemId: "x",
      fields: { ...item, itemRef: "A" },
    };
    expect(
      reviewRequestSchema.safeParse({ version: 0, operation }).success,
    ).toBe(true);
    expect(
      reviewRequestSchema.safeParse({
        version: 0,
        operation: {
          ...operation,
          fields: { ...operation.fields, amount: "1234567890123456789" },
        },
      }).success,
    ).toBe(false);
    expect(
      reviewRequestSchema.safeParse({
        version: 0,
        operation: {
          ...operation,
          fields: { ...operation.fields, qty: "1.00001" },
        },
      }).success,
    ).toBe(false);
  });
  it("rebuilds every level of the searchable description", () => {
    expect(
      fullDescription(
        "External works",
        "Paving",
        "Concrete pavers",
        "Red, 60 mm",
      ),
    ).toBe("External works — Paving — Concrete pavers — Red, 60 mm");
  });
});
