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
});
export type ExtractResult = z.infer<typeof extractResultSchema>;

export const inspectResultSchema = z.object({
  file_type: z.enum(["pdf", "xlsx"]),
  pages: z.number().int(),
  cover: coverSchema,
});
export type InspectResult = z.infer<typeof inspectResultSchema>;
