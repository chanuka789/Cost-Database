import { describe, expect, it } from "vitest";
import { extractResultSchema } from "./extraction-schema";
import { planIngest } from "./ingest-plan";

const item = (ref: string, extra: Record<string, unknown> = {}) => ({
  ref,
  description: `Item ${ref}`,
  full_description: `Paving — Item ${ref}`,
  unit_raw: "m2",
  unit: "m²",
  qty: "10",
  rate: null,
  amount: null,
  rate_note: null,
  page: 2,
  flags: [],
  ...extra,
});

const result = extractResultSchema.parse({
  parser: "pdf-columns",
  version: "1.0.0",
  file_type: "pdf",
  cover: { project_name: null, boq_date: null, stage_text: null, stage_guess: null },
  bills: [
    {
      bill_no: "02",
      title: "HARDSCAPING",
      sections: [
        {
          parent_heading: null,
          heading: "Paving",
          main_descriptions: [
            {
              text: "60mm pavers on sand bed",
              page_from: 2,
              page_to: 3,
              items: [
                item("A", { rate: "145.5", amount: "1455" }),
                item("B", { flags: [{ code: "MISSING_UNIT", severity: "warning", message: "No unit found." }] }),
                item("C", { rate_note: "Included" }),
              ],
            },
          ],
        },
      ],
    },
  ],
  page_totals: [],
  issues: [{ code: "PAGE_TOTAL_MISMATCH", severity: "error", message: "x", page: 2 }],
  stats: { items: 3, priced_items: 1, bills: 1, pages: 5 },
});

describe("planIngest", () => {
  let n = 0;
  const plan = planIngest(result, "doc1", "SAR", () => `id${++n}`);

  it("links every level to its parent", () => {
    expect(plan.bills[0]).toMatchObject({ documentId: "doc1", billNo: "02" });
    expect(plan.sections[0].billId).toBe(plan.bills[0].id);
    expect(plan.mainDescriptions[0].sectionId).toBe(plan.sections[0].id);
    expect(plan.items.every((i) => i.mainDescriptionId === plan.mainDescriptions[0].id)).toBe(true);
  });

  it("stores one main description for all its items, in order", () => {
    expect(plan.mainDescriptions).toHaveLength(1);
    expect(plan.items.map((i) => [i.itemRef, i.sortOrder])).toEqual([
      ["A", 0],
      ["B", 1],
      ["C", 2],
    ]);
  });

  it("creates rates only where there is a rate, amount or note", () => {
    expect(plan.rates).toHaveLength(2);
    expect(plan.rates[0]).toMatchObject({ itemId: plan.items[0].id, rate: "145.5", amount: "1455", currency: "SAR" });
    expect(plan.rates[1]).toMatchObject({ itemId: plan.items[2].id, rate: null, rateNote: "Included" });
  });

  it("counts errors and warnings from items and the document", () => {
    expect(plan.counts).toEqual({ items: 3, errors: 1, warnings: 1 });
  });
});
