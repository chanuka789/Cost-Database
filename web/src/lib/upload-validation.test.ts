import { describe, expect, it } from "vitest";
import { boqDateProblem, detectFileType, fileProblem, projectDateValue, uploadSchema } from "./upload-validation";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("file checks", () => {
  it("accepts real PDFs and xlsx files", () => {
    expect(detectFileType("BOQ.PDF", PDF)).toBe("pdf");
    expect(detectFileType("boq.xlsx", ZIP)).toBe("xlsx");
  });
  it("rejects files whose content doesn't match the name", () => {
    expect(detectFileType("boq.pdf", ZIP)).toBeNull();
    expect(fileProblem("boq.pdf", 100, ZIP)).toMatch(/PDF or an Excel/);
  });
  it("explains old .xls, empty and oversized files", () => {
    expect(fileProblem("old.xls", 100, ZIP)).toMatch(/\.xlsx/);
    expect(fileProblem("a.pdf", 0, PDF)).toMatch(/empty/);
    expect(fileProblem("a.pdf", 51 * 1024 * 1024, PDF)).toMatch(/50 MB/);
    expect(fileProblem("a.pdf", 1000, PDF)).toBeNull();
  });
});

const document = { title: "Q-Walk SD 50% BOQ", rateType: "PTE", stageId: "s1", boqDate: "2026-10-05", currency: "SAR" };
const project = {
  name: "Q-Walk",
  projectNo: "26-1120",
  projectDatePrecision: "DAY",
  projectDate: "2026-09-14",
  countryId: "c1",
  cityId: "city1",
  buildingTypeId: "b1",
  client: "",
  consultant: "",
};

describe("upload form", () => {
  it("accepts a new project and turns blank optional fields into null", () => {
    const r = uploadSchema.parse({ projectMode: "new", project, document });
    expect(r.projectMode === "new" && r.project.client).toBeNull();
  });
  it("accepts an existing project", () => {
    expect(uploadSchema.safeParse({ projectMode: "existing", projectId: "p1", document }).success).toBe(true);
  });
  it("requires the key fields with clear messages", () => {
    const r = uploadSchema.safeParse({ projectMode: "new", project: { ...project, cityId: "" }, document: { ...document, stageId: "" } });
    expect(r.success).toBe(false);
    const messages = r.error!.issues.map((i) => i.message);
    expect(messages).toContain("Choose the city.");
    expect(messages).toContain("Choose the project stage.");
  });
  it("only allows PTE until tender returns are built", () => {
    const r = uploadSchema.safeParse({ projectMode: "existing", projectId: "p1", document: { ...document, rateType: "TENDER" } });
    expect(r.success).toBe(false);
  });
  it("accepts a month-only project date", () => {
    const r = uploadSchema.safeParse({ projectMode: "new", project: { ...project, projectDatePrecision: "MONTH", projectDate: "2026-09" }, document });
    expect(r.success).toBe(true);
    expect(projectDateValue("2026-09", "MONTH").toISOString().slice(0, 10)).toBe("2026-09-01");
  });
});

describe("BOQ date", () => {
  const today = new Date("2026-10-09T12:00:00Z");
  it("accepts past dates", () => expect(boqDateProblem("2026-10-05", today)).toBeNull());
  it("rejects impossible and future dates", () => {
    expect(boqDateProblem("2026-02-30", today)).toMatch(/valid/);
    expect(boqDateProblem("2027-01-01", today)).toMatch(/future/);
  });
});
