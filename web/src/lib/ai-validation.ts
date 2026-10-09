import { z } from "zod";

export const PROVIDER_PRESETS = {
  DEEPSEEK: { url: "https://api.deepseek.com/v1", model: "deepseek-chat", policy: "Review DeepSeek's current retention and training policy before sending client text.", link: "https://api-docs.deepseek.com" },
  META: { url: "https://api.meta.ai/v1", model: "muse-spark-1.3", policy: "Standard and Contributor tiers have different data policies. Review your account tier before sending client text.", link: "https://dev.meta.ai/docs/overview" },
  OPENROUTER: { url: "https://openrouter.ai/api/v1", model: "", policy: "OpenRouter routes to other providers. Review both router and selected model provider retention policies, including free models.", link: "https://openrouter.ai/docs/guides/privacy/data-collection" },
  CUSTOM: { url: "", model: "", policy: "Review this endpoint operator's retention, training and regional processing policy.", link: "" },
} as const;
export const aiChoiceSchema = z.string().min(1).max(100).default("OFF");
export const providerSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(80),
  type: z.enum(["DEEPSEEK", "META", "OPENROUTER", "CUSTOM"]),
  baseUrl: z.url().max(500).refine((v) => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && (!u.port || u.port === "443"); }, "Use a public HTTPS base URL without credentials or query parameters."),
  model: z.string().trim().min(1).max(150),
  taskModels: z.object({ TEXT: z.string().trim().max(150).optional(), TRADE: z.string().trim().max(150).optional(), LINK: z.string().trim().max(150).optional(), MAPPING: z.string().trim().max(150).optional() }).strict().default({}),
  key: z.string().trim().max(4096).optional(), enabled: z.boolean().default(false),
  priority: z.number().int().min(0).max(1000),
  inputPrice: z.number().min(0).max(10000), outputPrice: z.number().min(0).max(10000),
  monthlyBudget: z.number().positive().max(100000).nullable(),
  dataPolicy: z.string().trim().min(10).max(2000),
}).strict();
export type ProviderInput = z.infer<typeof providerSchema>;
export const aiSettingsSchema = z.object({ defaultChoice: aiChoiceSchema, enabled: z.boolean() }).strict();
export const suggestionSchema = z.object({
  itemId: z.string().min(1), kind: z.enum(["TEXT", "TRADE", "LINK"]),
  proposed: z.string().trim().min(1).max(20000), reason: z.string().trim().min(1).max(500),
}).strict();
export const suggestionsSchema = z.object({ suggestions: z.array(suggestionSchema).max(100) }).strict();
export const mappingSchema = z.object({ columns: z.object({ reference: z.string().nullable(), description: z.string(), unit: z.string().nullable(), quantity: z.string().nullable(), rate: z.string().nullable(), amount: z.string().nullable() }).strict(), reason: z.string().max(1000) }).strict();
const header = z.string().trim().min(1).max(150);
export const columnMappingSchema = z.object({ reference: header.nullable(), description: header, unit: header, quantity: header, rate: header.nullable(), amount: header.nullable() }).strict().refine(columns => { const values = Object.values(columns).filter(v => v !== null); return new Set(values).size === values.length; }, "Each field must use a different source column.");
export type ColumnMapping = z.infer<typeof columnMappingSchema>;
// Also protect dimensions, standards and other numbers embedded in descriptions.
export function sameNumbers(a: string, b: string) {
  return JSON.stringify(a.match(/\d+(?:[.,]\d+)*/g) ?? []) === JSON.stringify(b.match(/\d+(?:[.,]\d+)*/g) ?? []);
}
export function costFor(input: number, output: number, inputPrice: number, outputPrice: number) {
  return (input * inputPrice + output * outputPrice) / 1_000_000;
}
