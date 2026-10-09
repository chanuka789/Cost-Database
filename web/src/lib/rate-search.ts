import { z } from "zod";

export const currencies = ["SAR", "AED", "QAR"] as const;
export type DisplayCurrency = (typeof currencies)[number];
export const usdPegs = { SAR: 3.75, AED: 3.6725, QAR: 3.64 } as const;
export function convertRate(
  value: number,
  from: DisplayCurrency,
  to: DisplayCurrency,
) {
  return (value * usdPegs[to]) / usdPegs[from];
}
const id = z.string().min(1).max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid date");
export const searchSchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(200)
      .refine((q) => searchTokens(q).length <= 20, "Use up to 20 search words.")
      .default(""),
    projects: z.array(id).max(30).default([]),
    stages: z.array(id).max(30).default([]),
    country: id.optional(),
    city: id.optional(),
    buildingType: id.optional(),
    rateType: z.enum(["PTE", "TENDER"]).optional(),
    unit: z.string().max(60).optional(),
    trade: z.string().max(500).optional(),
    bidder: id.optional(),
    boqFrom: date.optional(),
    boqTo: date.optional(),
    projectFrom: date.optional(),
    projectTo: date.optional(),
    currency: z.enum(currencies).default("SAR"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine(
    (f) => !f.boqFrom || !f.boqTo || f.boqFrom <= f.boqTo,
    "BOQ start date must be before end date",
  )
  .refine(
    (f) => !f.projectFrom || !f.projectTo || f.projectFrom <= f.projectTo,
    "Project start date must be before end date",
  );
export type SearchFilters = z.infer<typeof searchSchema>;
export function parseSearch(params: URLSearchParams): SearchFilters {
  const value: Record<string, unknown> = {};
  for (const key of [
    "q",
    "country",
    "city",
    "buildingType",
    "rateType",
    "unit",
    "trade",
    "bidder",
    "boqFrom",
    "boqTo",
    "projectFrom",
    "projectTo",
    "currency",
    "page",
  ]) {
    const entry = params.get(key);
    if (entry) value[key] = entry;
  }
  value.projects = [...new Set(params.getAll("projects"))];
  value.stages = [...new Set(params.getAll("stages"))];
  return searchSchema.parse(value);
}
export function searchParams(filters: SearchFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (
      value !== undefined &&
      value !== "" &&
      !(key === "page" && value === 1)
    )
      params.set(key, String(value));
  }
  return params;
}
export function searchTokens(query: string) {
  const normalized = query
    .toLowerCase()
    .replace(/(\d)\s*[×x]\s*(?=\d)/g, "$1x")
    .replace(/(\d)\s+(mm|cm|m)\b/g, "$1$2");
  return [...new Set(normalized.match(/[\p{L}\p{N}]+/gu) ?? [])];
}
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
export const exportSchema = z.object({
  rateIds: z
    .array(id)
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length),
  currency: z.enum(currencies),
});

export type RateRow = {
  rateId: string;
  itemId: string;
  documentId: string;
  projectId: string;
  groupId: string;
  itemRef: string;
  description: string;
  fullDescription: string;
  unit: string | null;
  qty: string | null;
  rate: string | null;
  amount: string | null;
  rateNote: string | null;
  originalRate: string | null;
  originalAmount: string | null;
  originalCurrency: DisplayCurrency;
  currency: DisplayCurrency;
  bidderId: string | null;
  bidderCount: number;
  page: number;
  fileType: string;
  projectName: string;
  projectNo: string | null;
  projectDate: string;
  projectDatePrecision: string;
  country: string;
  city: string;
  buildingType: string;
  stage: string;
  boqDate: string;
  billNo: string;
  billTitle: string;
  heading: string | null;
  mainDescription: string;
  rateType: string;
  trade: string;
};
export type SearchResult = {
  rows: RateRow[];
  total: number;
  projects: number;
  numericRates: number;
  units: string[];
  stats: { median: number; min: number; max: number; unit: string } | null;
  page: number;
  pageSize: number;
  elapsedMs: number;
};
export type SearchOptions = {
  projects: { id: string; name: string; projectNo: string | null }[];
  countries: { id: string; name: string }[];
  cities: { id: string; name: string; countryId: string }[];
  buildingTypes: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  units: string[];
  trades: string[];
  bidders: string[];
};
export type ItemDetail = {
  item: RateRow;
  rates: RateRow[];
  siblings: RateRow[];
  history: {
    boqDate: string;
    projectName: string;
    rate: string;
    rateType: string;
    stage: string;
  }[];
  historyCount: number;
  stats: { median: number; min: number; max: number } | null;
};
