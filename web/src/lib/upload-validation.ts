import { z } from "zod";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** The file's real type from its first bytes — the name alone can lie. */
export function detectFileType(name: string, head: Uint8Array): "pdf" | "xlsx" | null {
  const ext = name.toLowerCase().split(".").pop();
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04; // PK.. (xlsx is a zip)
  if (ext === "pdf" && isPdf) return "pdf";
  if (ext === "xlsx" && isZip) return "xlsx";
  return null;
}

export function fileProblem(name: string, size: number, head: Uint8Array): string | null {
  if (size === 0) return "The file is empty.";
  if (size > MAX_UPLOAD_BYTES) return "The file is larger than 50 MB.";
  if (name.toLowerCase().endsWith(".xls")) return "Old .xls files aren't supported. Open it in Excel, save as .xlsx, then upload.";
  if (!detectFileType(name, head)) return "Upload a PDF or an Excel (.xlsx) BOQ.";
  return null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, "Enter a valid month.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const newProjectSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the project name.").max(120, "Use 120 characters or fewer."),
    projectNo: optionalText(30),
    projectDatePrecision: z.enum(["DAY", "MONTH"]),
    projectDate: z.string(),
    countryId: z.string().min(1, "Choose the country."),
    cityId: z.string().min(1, "Choose the city."),
    buildingTypeId: z.string().min(1, "Choose the building type."),
    client: optionalText(120),
    consultant: optionalText(120),
  })
  .superRefine((p, ctx) => {
    const ok = p.projectDatePrecision === "MONTH" ? isoMonth.safeParse(p.projectDate).success : isoDate.safeParse(p.projectDate).success;
    if (!ok) ctx.addIssue({ code: "custom", path: ["projectDate"], message: "Enter the project date." });
  });

export const documentSchema = z.object({
  title: z.string().trim().min(2, "Enter a title for this BOQ.").max(160, "Use 160 characters or fewer."),
  rateType: z.literal("PTE", { error: "Only PTE BOQs can be uploaded for now. Tender returns come in a later phase." }),
  stageId: z.string().min(1, "Choose the project stage."),
  boqDate: isoDate,
  currency: z.enum(["SAR", "AED", "QAR"], { error: "Choose the currency." }),
});

export const uploadSchema = z.discriminatedUnion("projectMode", [
  z.object({ projectMode: z.literal("existing"), projectId: z.string().min(1, "Choose the project."), document: documentSchema }),
  z.object({ projectMode: z.literal("new"), project: newProjectSchema, document: documentSchema }),
]);
export type UploadInput = z.infer<typeof uploadSchema>;

/** "2026-10" (month only) is stored as the 1st of the month. */
export function projectDateValue(value: string, precision: "DAY" | "MONTH"): Date {
  return new Date(`${precision === "MONTH" ? `${value}-01` : value}T00:00:00Z`);
}

/** BOQ dates must be real calendar dates and not in the future. */
export function boqDateProblem(value: string, today = new Date()): string | null {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return "Enter a valid BOQ date.";
  if (d.getTime() > today.getTime() + 24 * 3600 * 1000) return "The BOQ date can't be in the future.";
  if (d.getUTCFullYear() < 1990) return "Enter a valid BOQ date.";
  return null;
}
