import "server-only";
import { z } from "zod";
import { AiError, withFallback } from "./ai-service";
import { rolesSchema, type LayoutPlan, type Roles, type RowsResult } from "./extraction-schema";

/**
 * AI layout reading, for BOQs whose layout the rule-based readers can't
 * follow. The extractor sends the file as a table of rows in which every
 * standalone number is already "#". The AI is asked which column is which
 * (only when the headers don't say) and to label every row; the extractor
 * then rebuilds the BOQ from those labels, reading every number from the
 * file itself. See extractor/app/layout.py.
 */

type Row = RowsResult["rows"][number];
export const LABELS = ["B", "H", "M", "I", "C", "T", "X"] as const;
const BATCH_ROWS = 120;
const BATCH_CHARS = 18_000;
const CONTEXT_ROWS = 3;
const PARALLEL = 4;

/** Defence in depth: refuse to send any standalone number, even though the extractor masks them. */
export function assertMasked(texts: Iterable<string>) {
  for (const text of texts)
    for (const token of text.split(/\s+/)) {
      const core = token.replace(/^[()[\]{},;:$£€]+|[()[\]{},;:$£€]+$/g, "").replace(/\.$/, "");
      if (/^\(?-?[\d,]*\.?\d+\)?$/.test(core)) throw new AiError("UNMASKED_NUMBER");
    }
}

const clean = (text: string, max: number) => text.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** One row as a prompt line: id|page|bold|ref|description|qty|unit|rate|amount|other. */
export function renderRow(row: Row, roles: Roles) {
  const used = new Set(Object.values(roles).filter(Boolean));
  const get = (field: keyof Roles) => (roles[field] ? row.cells[roles[field]!] ?? "" : "");
  const other = Object.entries(row.cells).filter(([k]) => !used.has(k)).map(([, v]) => v).join(" ");
  return [row.id, row.page, row.bold ? "b" : "", clean(get("reference"), 30), clean(get("description"), 220), clean(get("quantity"), 12), clean(get("unit"), 20), clean(get("rate"), 12), clean(get("amount"), 12), clean(other, 90)].join("|");
}

/** Consecutive batches of rows, each small enough for one prompt. */
export function batches(rows: Row[], render: (row: Row) => string) {
  const out: { rows: Row[]; lines: string[] }[] = [];
  let current: { rows: Row[]; lines: string[]; chars: number } | null = null;
  for (const row of rows) {
    const line = render(row);
    if (!current || current.rows.length >= BATCH_ROWS || current.chars + line.length > BATCH_CHARS) {
      current = { rows: [], lines: [], chars: 0 };
      out.push(current);
    }
    current.rows.push(row);
    current.lines.push(line);
    current.chars += line.length + 1;
  }
  return out.map(({ rows, lines }) => ({ rows, lines }));
}

export function rowsPrompt(lines: string[], context: string[], first: number, last: number) {
  return `You label the rows of a construction Bill of Quantities (BOQ) so software can rebuild its structure.
Each line is one row: id|page|bold|ref|description|qty|unit|rate|amount|other. "#" is a hidden number; "b" marks bold text.
Labels:
B = title that starts a new bill, trade section or zone (e.g. "BILL NO. 3 - CONCRETE WORKS", "DETAILED COST BREAKDOWN - LOBBY")
H = heading: a short title over the group of items below it
M = main description: a paragraph describing the items that follow; consecutive M rows join into one paragraph
I = the first row of a measured item: usually has a qty, unit, rate or amount, often a ref
C = continuation of the item directly above: more of its description, or its figures on a separate row
T = page or collection total of the items above it; if its words and its figure are on separate rows, label both T
X = anything else: column headers, repeated page titles, page numbers, general notes and conditions, summaries, brought/carried forward
Every row inside a run gets that run's label, so consecutive items can share one "I" run.
Return {"runs":[[firstId,lastId,"label"],...]}: runs in order covering every id from ${first} to ${last}, with no gaps or overlaps.
${context.length ? `Context (already labelled, do not label):\n${context.map((l) => `~${l}`).join("\n")}\n` : ""}Rows:
${lines.join("\n")}`;
}

/** The AI's runs, checked to cover exactly ids first..last; returns one label per row. */
export function runsSchema(first: number, last: number) {
  return z
    .object({ runs: z.array(z.tuple([z.number().int(), z.number().int(), z.enum(LABELS)])).min(1).max(BATCH_ROWS) })
    .strict()
    .transform((data, ctx) => {
      let next = first;
      let labels = "";
      for (const [from, to, label] of data.runs) {
        if (from !== next || to < from || to > last) {
          ctx.addIssue({ code: "custom", message: "Runs must cover every row once, in order" });
          return z.NEVER;
        }
        labels += label.repeat(to - from + 1);
        next = to + 1;
      }
      if (next !== last + 1) {
        ctx.addIssue({ code: "custom", message: "Runs stop before the last row" });
        return z.NEVER;
      }
      return labels;
    });
}

export function columnsPrompt(layout: RowsResult["layouts"][number]) {
  return `Identify the columns of this Bill of Quantities table. "#" is a hidden number.
Column keys with their header labels (if any): ${JSON.stringify(layout.headers)}
Sample rows, each a map of column key to cell text: ${JSON.stringify(layout.sample.map((cells) => Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, clean(v, 80)]))))}
Return {"columns":{"reference":KEY or null,"description":KEY,"quantity":KEY or null,"unit":KEY or null,"rate":KEY or null,"amount":KEY or null}} using only these keys, each at most once: ${JSON.stringify(layout.columns)}.`;
}

export function columnsSchema(columns: string[]) {
  return z
    .object({ columns: rolesSchema })
    .strict()
    .refine(({ columns: c }) => {
      const chosen = Object.values(c).filter((v): v is string => v !== null);
      return chosen.every((v) => columns.includes(v)) && new Set(chosen).size === chosen.length;
    }, "Unknown or repeated column");
}

type Doc = { id: string; aiChoice: string; aiAllowFallback: boolean; aiRecipients: unknown };

/** Runs `work` on up to `limit` items at a time; after a failure no new items start. */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      try {
        await work(items[next++]);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  }));
}

/**
 * Asks the document's AI provider for column roles and row labels. Throws
 * AiError if any part can't be read; the caller keeps the rule-based result.
 */
export async function runAiLayout(doc: Doc, table: RowsResult, progress: (text: string) => Promise<void>, deadline = Date.now() + 20 * 60_000): Promise<LayoutPlan> {
  assertMasked([...table.rows.flatMap((r) => Object.values(r.cells)), ...table.layouts.flatMap((l) => l.sample.flatMap((s) => Object.values(s)))]);
  const ask = (task: string, prompt: string, schema: z.ZodType) => withFallback(doc.aiChoice, doc.aiAllowFallback, task, prompt, schema, doc.id, deadline, doc.aiRecipients);

  const roles: Record<string, Roles> = {};
  for (const layout of table.layouts) {
    if (layout.roles) {
      roles[layout.key] = layout.roles;
      continue;
    }
    await progress("AI is identifying the columns");
    const r = await ask("LAYOUT", columnsPrompt(layout), columnsSchema(layout.columns));
    roles[layout.key] = (r.data as { columns: Roles }).columns;
  }

  const labels = new Array<string>(table.rows.length);
  const work = batches(table.rows, (row) => renderRow(row, roles[row.layout]));
  let done = 0;
  const label = async (rows: Row[], lines: string[]) => {
    const first = rows[0].id, last = rows[rows.length - 1].id;
    const context = table.rows.slice(Math.max(0, first - CONTEXT_ROWS), first).map((row) => renderRow(row, roles[row.layout]));
    const r = await ask("ROWS", rowsPrompt(lines, context, first, last), runsSchema(first, last));
    [...(r.data as string)].forEach((l, i) => (labels[first + i] = l));
  };
  await progress(`AI is reading the layout (0 of ${work.length} parts)`);
  await pool(work, PARALLEL, async ({ rows, lines }) => {
    try {
      await label(rows, lines);
    } catch (e) {
      // Long batches fail more often (miscounted runs); retry once in halves.
      if (rows.length < 2 || (e instanceof AiError && ["NO_PROVIDER", "AI_DISABLED", "BUDGET_LIMIT", "DISABLED"].includes(e.message))) throw e;
      const half = Math.ceil(rows.length / 2);
      await label(rows.slice(0, half), lines.slice(0, half));
      await label(rows.slice(half), lines.slice(half));
    }
    done++;
    await progress(`AI is reading the layout (${done} of ${work.length} parts)`);
  });
  if (labels.some((l) => !l)) throw new AiError("INCOMPLETE_LABELS");
  return { rows_hash: table.rows_hash, roles, labels: labels.join("") };
}
