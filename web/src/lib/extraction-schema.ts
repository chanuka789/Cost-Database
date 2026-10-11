import { z } from "zod";

/**
 * The extractor's output (extractor/app/models.py). Validated on arrival so a
 * mismatch between the two services fails loudly instead of saving bad data.
 * Quantities, rates and amounts are decimal strings.
 */
const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "not a decimal")
  .nullable();

const severity = z.enum(["error", "warning", "info"]);

export const flagSchema = z.object({ code: z.string(), severity, message: z.string() });
export type Flag = z.infer<typeof flagSchema>;

const itemSchema = z.object({
  ref: z.string(),
  description: z.string(),
  full_description: z.string(),
  unit_raw: z.string().nullable(),
  unit: z.string().nullable(),
  qty: decimal,
  rate: decimal,
  amount: decimal,
  rate_note: z.string().nullable(),
  page: z.number().int(),
  flags: z.array(flagSchema),
});

export const coverSchema = z.object({
  project_name: z.string().nullable(),
  boq_date: z.string().nullable(),
  stage_text: z.string().nullable(),
  stage_guess: z.string().nullable(),
});
export type Cover = z.infer<typeof coverSchema>;

export const issueSchema = z.object({ code: z.string(), severity, message: z.string(), page: z.number().int().nullable() });
export type Issue = z.infer<typeof issueSchema>;

export const extractResultSchema = z.object({
  parser: z.string(),
  version: z.string(),
  file_type: z.enum(["pdf", "xlsx"]),
  cover: coverSchema,
  bills: z.array(
    z.object({
      bill_no: z.string(),
      title: z.string(),
      sections: z.array(
        z.object({
          parent_heading: z.string().nullable(),
          heading: z.string().nullable(),
          main_descriptions: z.array(
            z.object({ text: z.string(), page_from: z.number().int(), page_to: z.number().int(), items: z.array(itemSchema) }),
          ),
        }),
      ),
    }),
  ),
  page_totals: z.array(z.object({ page: z.number().int(), bill_no: z.string().nullable(), amount: decimal })),
  issues: z.array(issueSchema),
  stats: z.object({ items: z.number().int(), priced_items: z.number().int(), bills: z.number().int(), pages: z.number().int() }),
  /** recommend_ai: the rule-based reading looks wrong; try the AI layout reader. */
  quality: z.object({ recommend_ai: z.boolean(), reasons: z.array(z.string()) }).default({ recommend_ai: false, reasons: [] }),
});
export type ExtractResult = z.infer<typeof extractResultSchema>;

/**
 * The BOQ as a masked row table (extractor/app/layout.py), for AI layout
 * reading. Every standalone number is already "#".
 */
const roleKey = z.string().min(1).max(40).nullable();
export const rolesSchema = z.object({ reference: roleKey, description: z.string().min(1).max(40), quantity: roleKey, unit: roleKey, rate: roleKey, amount: roleKey }).strict();
export type Roles = z.infer<typeof rolesSchema>;
const cells = z.record(z.string().max(40), z.string().max(20000));
export const rowsResultSchema = z.object({
  file_type: z.enum(["pdf", "xlsx"]),
  pages: z.number().int(),
  rows_hash: z.string().regex(/^[0-9a-f]{64}$/),
  layouts: z.array(z.object({ key: z.string().max(5000), headers: z.record(z.string(), z.string()), roles: rolesSchema.nullable(), columns: z.array(z.string()), sample: z.array(cells) })).max(30),
  rows: z.array(z.object({ id: z.number().int().min(0), page: z.number().int(), layout: z.string(), bold: z.boolean(), cells })).max(15000),
});
export type RowsResult = z.infer<typeof rowsResultSchema>;
export type LayoutPlan = { rows_hash: string; roles: Record<string, Roles>; labels: string };

export const inspectResultSchema = z.object({
  file_type: z.enum(["pdf", "xlsx"]),
  pages: z.number().int(),
  cover: coverSchema,
});
export type InspectResult = z.infer<typeof inspectResultSchema>;
