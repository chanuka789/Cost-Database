import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./ai-service", () => ({ AiError: class AiError extends Error {}, withFallback: vi.fn() }));
import { assertMasked, batches, columnsSchema, renderRow, rowsPrompt, runAiLayout, runsSchema } from "./ai-layout";
import { withFallback } from "./ai-service";
import type { RowsResult } from "./extraction-schema";

const roles = { reference: "A", description: "B", quantity: "C", unit: "D", rate: "E", amount: "F" };
const row = (id: number, cells: Record<string, string>, bold = false) => ({ id, page: 1, layout: "L", bold, cells });

describe("AI layout reading", () => {
  it("refuses to send any standalone number", () => {
    expect(() => assertMasked(["To footpaths", "#", "500mm dia P4, ref 2.5.1", "Rate Only"])).not.toThrow();
    for (const leak of ["Qty 120", "85.00", "(1,250)", "total: 10.", "$4"]) expect(() => assertMasked([leak])).toThrow("UNMASKED_NUMBER");
  });

  it("renders rows by role, keeping other columns as context", () => {
    expect(renderRow(row(7, { A: "#", B: "To footpaths | north", C: "#", D: "m2", E: "#", F: "#", J: "1.4.4 Qty Change" }, true), roles)).toBe("7|1|b|#|To footpaths north|#|m2|#|#|1.4.4 Qty Change");
    expect(renderRow(row(8, { top: "BILL NO. 3 - CONCRETE" }), roles)).toBe("8|1||||||||BILL NO. 3 - CONCRETE");
  });

  it("splits long tables into prompt-sized batches", () => {
    const rows = Array.from({ length: 250 }, (_, i) => row(i, { B: "Excavation for pile caps" }));
    const parts = batches(rows, (r) => renderRow(r, roles));
    expect(parts.map((p) => p.rows.length)).toEqual([120, 120, 10]);
    expect(parts[1].rows[0].id).toBe(120);
    const wide = Array.from({ length: 40 }, (_, i) => row(i, { B: "x".repeat(220), J: "y".repeat(90) }));
    for (const p of batches(wide, (r) => renderRow(r, roles))) expect(p.lines.join("\n").length).toBeLessThanOrEqual(18_000);
    expect(rowsPrompt(["5|1||…"], ["4|1||…"], 5, 5)).toContain("~4|1||…");
  });

  it("accepts only runs that cover the batch exactly", () => {
    const schema = runsSchema(10, 15);
    expect(schema.parse({ runs: [[10, 10, "H"], [11, 11, "M"], [12, 14, "I"], [15, 15, "T"]] })).toBe("HMIIIT");
    for (const runs of [
      [[10, 14, "I"]], // stops early
      [[10, 12, "I"], [14, 15, "I"]], // gap
      [[10, 12, "I"], [12, 15, "I"]], // overlap
      [[11, 15, "I"]], // starts late
      [[10, 16, "I"]], // runs past the batch
      [[10, 15, "Q"]], // unknown label
    ])
      expect(schema.safeParse({ runs }).success).toBe(false);
    expect(schema.safeParse({ runs: [[10, 15, "I"]], qty: 5 }).success).toBe(false);
  });

  it("accepts only known, distinct columns", () => {
    const schema = columnsSchema(["A", "B", "C", "D"]);
    const ok = { reference: "A", description: "B", quantity: "C", unit: "D", rate: null, amount: null };
    expect(schema.safeParse({ columns: ok }).success).toBe(true);
    expect(schema.safeParse({ columns: { ...ok, rate: "Z" } }).success).toBe(false);
    expect(schema.safeParse({ columns: { ...ok, unit: "C" } }).success).toBe(false);
    expect(schema.safeParse({ columns: { ...ok, description: null } }).success).toBe(false);
  });

  it("asks for missing columns, labels every row and retries a failed batch in halves", async () => {
    const table: RowsResult = {
      file_type: "xlsx", pages: 1, rows_hash: "a".repeat(64),
      layouts: [{ key: "L", headers: {}, roles: null, columns: ["A", "B", "C", "D", "E", "F"], sample: [{ B: "Pavers", C: "#" }] }],
      rows: [row(0, { B: "Paving" }, true), row(1, { A: "#", B: "Pavers", C: "#", D: "m2" }), row(2, { F: "#" })],
    };
    const mock = vi.mocked(withFallback);
    mock.mockReset();
    mock.mockImplementationOnce(async () => ({ data: { columns: roles } }) as never);
    mock.mockImplementationOnce(async () => { throw new Error("miscounted runs"); });
    mock.mockImplementationOnce(async () => ({ data: "HI" }) as never);
    mock.mockImplementationOnce(async () => ({ data: "T" }) as never);
    const steps: string[] = [];
    const plan = await runAiLayout({ id: "d", aiChoice: "p", aiAllowFallback: false, aiRecipients: [] }, table, async (s) => { steps.push(s); });
    expect(plan).toEqual({ rows_hash: "a".repeat(64), roles: { L: roles }, labels: "HIT" });
    expect(mock.mock.calls.map((c) => c[2])).toEqual(["LAYOUT", "ROWS", "ROWS", "ROWS"]);
    expect(steps.at(-1)).toBe("AI is reading the layout (1 of 1 parts)");
    expect(mock.mock.calls[0][3]).not.toMatch(/\d{2,}/); // no numbers in the columns prompt beyond ids
  });

  it("never sends a table that still contains numbers", async () => {
    const table = { file_type: "xlsx", pages: 1, rows_hash: "a".repeat(64), layouts: [], rows: [row(0, { C: "120" })] } as RowsResult;
    vi.mocked(withFallback).mockReset();
    await expect(runAiLayout({ id: "d", aiChoice: "p", aiAllowFallback: false, aiRecipients: [] }, table, async () => {})).rejects.toThrow("UNMASKED_NUMBER");
    expect(withFallback).not.toHaveBeenCalled();
  });
});
