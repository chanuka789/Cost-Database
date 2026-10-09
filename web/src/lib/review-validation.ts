import { z } from "zod";
import { flagSchema, issueSchema, type Flag } from "./extraction-schema";

const decimal = (precision: number, scale: number) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^-?\\d{1,${precision - scale}}(\\.\\d{1,${scale}})?$`),
      "Enter a decimal within the supported precision.",
    )
    .nullable();
const ids = z
  .array(z.string().min(1))
  .min(1)
  .max(500)
  .refine((x) => new Set(x).size === x.length, "Duplicate items.");
const fields = z.object({
  itemRef: z.string().trim().min(1).max(100),
  description: z.string().trim().max(20000),
  unit: z.string().trim().max(40).nullable(),
  qty: decimal(18, 4),
  rate: decimal(18, 4),
  amount: decimal(20, 2),
  rateNote: z.string().trim().max(200).nullable(),
});
export const reviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("item"), itemId: z.string(), fields }),
  z.object({
    action: z.literal("group"),
    groupId: z.string(),
    text: z.string().trim().max(20000),
  }),
  z.object({
    action: z.literal("section"),
    sectionId: z.string(),
    heading: z.string().trim().max(1000).nullable(),
    parentHeading: z.string().trim().max(1000).nullable(),
  }),
  z.object({
    action: z.literal("bill"),
    billId: z.string(),
    billNo: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(1000),
  }),
  z.object({ action: z.literal("check"), itemIds: ids, checked: z.boolean() }),
  z.object({
    action: z.literal("unit"),
    itemIds: ids,
    unit: z.string().trim().min(1).max(40),
  }),
  z.object({ action: z.literal("move"), itemIds: ids, groupId: z.string() }),
  z.object({
    action: z.literal("split"),
    itemIds: ids,
    text: z.string().trim().max(20000),
  }),
  z.object({
    action: z.literal("merge"),
    groupIds: ids,
    text: z.string().trim().max(20000),
  }),
  z.object({
    action: z.literal("accept"),
    itemId: z.string().optional(),
    key: z.string().min(1),
    reason: z.string().trim().min(5).max(2000),
  }),
  z.object({ action: z.literal("publish") }),
]);
export const reviewRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  operation: reviewActionSchema,
});
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export const flagsOf = (value: unknown) =>
  z.array(flagSchema).parse(value ?? []);
export const issuesOf = (value: unknown) =>
  z.array(issueSchema).parse(value ?? []);
export const acceptanceSchema = z.array(
  z.object({
    key: z.string(),
    reason: z.string(),
    userId: z.string(),
    at: z.string(),
  }),
);
export const acceptancesOf = (value: unknown) =>
  acceptanceSchema.parse(value ?? []);
export const flagKey = (flag: Flag & { page?: number | null }) =>
  JSON.stringify([flag.code, flag.severity, flag.message, flag.page ?? null]);
export const unresolved = (flags: Flag[], accepted: unknown) => {
  const keys = new Set(acceptancesOf(accepted).map((a) => a.key));
  return flags.filter((f) => !keys.has(flagKey(f)));
};
export function fullDescription(
  parent: string | null,
  heading: string | null,
  main: string,
  item: string,
) {
  return [parent, heading, main, item].filter((s) => s?.trim()).join(" — ");
}
