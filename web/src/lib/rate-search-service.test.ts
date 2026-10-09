import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { prisma } from "./prisma";
import { parseSearch } from "./rate-search";
import { basketRates, rateDetail, searchRates } from "./rate-search-service";
import { exportRateWorkbook } from "./rate-export";
import ExcelJS from "exceljs";
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl && !["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname))
  throw new Error("Search tests require a local database.");
if (testUrl) process.env.DATABASE_URL = testUrl;
describe.skipIf(!testUrl)("published rate search integration", () => {
  let userId: string;
  let projectIds: string[] = [];
  let documentIds: string[] = [];
  let itemId: string;
  let draftItemId: string;
  let rateIds: string[] = [];
  let draftRateId: string;
  let stageId: string;
  beforeAll(async () => {
    const country = await prisma.country.findFirstOrThrow();
    const [city, buildingType, stage] = await Promise.all([
      prisma.city.findFirstOrThrow({ where: { countryId: country.id } }),
      prisma.buildingType.findFirstOrThrow(),
      prisma.stage.findFirstOrThrow(),
    ]);
    stageId = stage.id;
    const user = await prisma.user.create({
      data: {
        name: "Search integration",
        email: `search-${Date.now()}@example.invalid`,
        status: "ACTIVE",
        role: "ADMIN",
      },
    });
    userId = user.id;
    for (let n = 0; n < 2; n++) {
      const project = await prisma.project.create({
        data: {
          name: `Search fixture ${Date.now()} ${n}`,
          projectNo: `SEARCH-${Date.now()}-${n}`,
          projectDate: new Date(`202${5 + n}-01-01`),
          countryId: country.id,
          cityId: city.id,
          buildingTypeId: buildingType.id,
          createdById: userId,
        },
      });
      projectIds.push(project.id);
      const doc = await prisma.boqDocument.create({
        data: {
          projectId: project.id,
          title: "Search fixture",
          status: "PUBLISHED",
          rateType: "PTE",
          stageId: stage.id,
          boqDate: new Date(`2026-0${n + 1}-01`),
          currency: n === 0 ? "SAR" : "AED",
          fileKey: "test",
          fileName: "test.pdf",
          fileType: "pdf",
          fileSize: 1,
          fileSha256: `search-${Date.now()}-${n}`,
          uploadedById: userId,
          publishedById: userId,
          publishedAt: new Date(),
        },
      });
      documentIds.push(doc.id);
      const bill = await prisma.bill.create({
        data: {
          documentId: doc.id,
          billNo: "02",
          title: "Hardscape",
          sortOrder: 0,
        },
      });
      const section = await prisma.section.create({
        data: { billId: bill.id, heading: "Concrete paving", sortOrder: 0 },
      });
      const group = await prisma.mainDescription.create({
        data: {
          sectionId: section.id,
          text: "Concrete pavers laid on sand",
          pageFrom: 2,
          pageTo: 2,
          sortOrder: 0,
        },
      });
      for (let k = 0; k < 4; k++) {
        const text =
          k === 0
            ? "60mm concrete paver 300x300 red"
            : k === 1
              ? "160mm concrete paver 300x300 blue"
              : k === 2
                ? "Concrete paver kerb"
                : '=HYPERLINK("bad")';
        const item = await prisma.boqItem.create({
          data: {
            documentId: doc.id,
            mainDescriptionId: group.id,
            itemRef: String(k),
            description: text,
            fullDescription: text,
            unit: k === 2 ? "m" : "m²",
            qty: 10,
            page: 2,
            sortOrder: k,
            rates: {
              create: {
                currency: n === 0 ? "SAR" : "AED",
                rate: k === 3 ? null : n === 0 ? 75 : 146.9,
                amount: 750,
                rateNote: k === 3 ? "Included" : null,
              },
            },
          },
          include: { rates: true },
        });
        if (k === 0 && n === 0) itemId = item.id;
        rateIds.push(item.rates[0].id);
      }
      if (n === 0) {
        const draft = await prisma.boqDocument.create({
          data: {
            projectId: project.id,
            title: "Hidden fixture",
            status: "REVIEW",
            rateType: "PTE",
            stageId: stage.id,
            boqDate: new Date("2026-03-01"),
            currency: "SAR",
            fileKey: "test",
            fileName: "test.pdf",
            fileType: "pdf",
            fileSize: 1,
            fileSha256: `hidden-${Date.now()}`,
            uploadedById: userId,
          },
        });
        documentIds.push(draft.id);
        const hidden = await prisma.boqItem.create({
          data: {
            documentId: draft.id,
            mainDescriptionId: group.id,
            itemRef: "H",
            description: "60mm concrete paver 300x300 red",
            fullDescription: "60mm concrete paver 300x300 red",
            unit: "m²",
            page: 2,
            sortOrder: 0,
            rates: { create: { currency: "SAR", rate: 999999 } },
          },
          include: { rates: true },
        });
        draftItemId = hidden.id;
        draftRateId = hidden.rates[0].id;
      }
    }
  });
  afterAll(async () => {
    await prisma.boqDocument.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.delete({ where: { id: userId } });
    projectIds = [];
    documentIds = [];
    rateIds = [];
  });
  const search = (query: string) =>
    searchRates(
      parseSearch(
        new URLSearchParams(
          `${query}&${projectIds.map((id) => `projects=${id}`).join("&")}`,
        ),
      ),
    );
  it("finds correct sizes with stemming and spelling tolerance", async () => {
    for (const q of [
      "60mm concrete paver",
      "60mm concrete pavr",
      "60 mm concrete paver 300 x 300",
    ]) {
      const result = await search(`q=${encodeURIComponent(q)}`);
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((r) => r.description.startsWith("60mm"))).toBe(
        true,
      );
    }
  });
  it("matches spaced and multiplication-sign dimensions without matching 160mm", async () => {
    const item = await prisma.boqItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    try {
      await prisma.boqItem.update({
        where: { id: itemId },
        data: { fullDescription: "60 mm concrete paver 300 × 300 red" },
      });
      expect((await search("q=60mm%20concrete%20paver%20300x300")).total).toBe(
        2,
      );
    } finally {
      await prisma.boqItem.update({
        where: { id: itemId },
        data: { fullDescription: item.fullDescription },
      });
    }
  });
  it("refuses combined statistics when even one numeric rate lacks a unit", async () => {
    await prisma.boqItem.update({
      where: { id: itemId },
      data: { unit: null },
    });
    try {
      expect((await search("q=60mm")).stats).toBeNull();
    } finally {
      await prisma.boqItem.update({
        where: { id: itemId },
        data: { unit: "m²" },
      });
    }
  });
  it("filters future tender rates by bidder and reports bidder counts", async () => {
    const item = await prisma.boqItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    await prisma.boqDocument.update({
      where: { id: item.documentId },
      data: { rateType: "TENDER" },
    });
    const bidderIds = [`bidder-a-${Date.now()}`, `bidder-b-${Date.now()}`];
    await prisma.rate.createMany({
      data: bidderIds.map((bidderId, n) => ({
        itemId,
        currency: "SAR",
        bidderId,
        rate: 70 + n * 10,
      })),
    });
    try {
      const result = await search(`rateType=TENDER&bidder=${bidderIds[0]}`);
      expect(result.total).toBe(1);
      expect(result.rows[0].bidderCount).toBe(2);
      expect(result.rows[0].rate).toBe("70.0000");
    } finally {
      await prisma.rate.deleteMany({ where: { bidderId: { in: bidderIds } } });
      await prisma.boqDocument.update({
        where: { id: item.documentId },
        data: { rateType: "PTE" },
      });
    }
  });
  it("computes converted median, min and max across all matches in SQL", async () => {
    const result = await search("q=60mm%20concrete%20paver&currency=SAR");
    expect(result.total).toBe(2);
    expect(result.projects).toBe(2);
    expect(result.stats?.min).toBeCloseTo(75, 3);
    expect(result.stats?.max).toBeCloseTo(150, 3);
    expect(result.stats?.median).toBeCloseTo(112.5, 3);
    expect(result.stats?.unit).toBe("m²");
    const aed = await search("q=60mm%20concrete%20paver&currency=AED");
    expect(aed.stats?.min).toBeCloseTo(73.45, 3);
  });
  it("never combines mixed units and excludes nonnumeric notes", async () => {
    const mixed = await search("q=concrete%20paver");
    expect(mixed.stats).toBeNull();
    expect(mixed.units).toEqual(["m", "m²"]);
    const unit = await search("unit=m²");
    expect(unit.total).toBe(6);
    expect(unit.numericRates).toBe(4);
    expect(unit.stats).not.toBeNull();
  });
  it("filters both date types, stage, trade and project numbers", async () => {
    expect(
      (await search("q=60mm&boqFrom=2026-02-01&projectFrom=2026-01-01")).total,
    ).toBe(1);
    expect((await search("q=60mm&projectTo=2025-12-31")).total).toBe(1);
    expect(
      (await search(`q=60mm&stages=${stageId}&trade=Concrete%20paving`)).total,
    ).toBe(2);
    expect((await search("q=60mm&stages=missing")).total).toBe(0);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectIds[0] },
    });
    expect((await search(`q=${project.projectNo}`)).total).toBe(4);
  });
  it("hides review documents from search, detail and baskets", async () => {
    expect(
      (await search("q=60mm")).rows.some((r) => r.itemId === draftItemId),
    ).toBe(false);
    expect(await rateDetail(draftItemId, "SAR")).toBeNull();
    expect(await basketRates([draftRateId], "SAR")).toEqual([]);
  });
  it("returns exact-description history and published siblings", async () => {
    const detail = await rateDetail(itemId, "QAR");
    expect(detail?.history.length).toBe(2);
    expect(detail?.siblings.length).toBe(3);
    expect(detail?.rates[0].currency).toBe("QAR");
    expect(detail?.historyCount).toBe(2);
  });
  it("exports actual source metadata and numeric prices as a valid Excel workbook", async () => {
    const rows = await basketRates(rateIds, "AED");
    const buffer = await exportRateWorkbook(rows, "AED");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const sheet = book.getWorksheet("Rates")!;
    expect(sheet.rowCount).toBe(9);
    expect(sheet.getRow(1).values).toContain("Full description");
    expect(sheet.getCell("R2").value).toBeCloseTo(73.45, 3);
    expect(sheet.getCell("V2").value).toBe(75);
    expect(sheet.getCell("O5").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("O5").value).toContain("=HYPERLINK");
    expect(book.getWorksheet("Conversion")).toBeDefined();
  });
  it("calculates statistics beyond the current page and meets the budget with 5,000 rates", async () => {
    const base = await prisma.boqItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    const stamp = Date.now();
    const items = Array.from({ length: 5000 }, (_, n) => ({
      id: `search-load-${stamp}-${n}`,
      documentId: base.documentId,
      mainDescriptionId: base.mainDescriptionId,
      itemRef: String(n),
      description: "Benchmark 60mm concrete paver",
      fullDescription: "Benchmark 60mm concrete paver",
      unit: "m²",
      page: 2,
      sortOrder: n + 10,
    }));
    await prisma.boqItem.createMany({ data: items });
    await prisma.rate.createMany({
      data: items.map((i, n) => ({
        itemId: i.id,
        currency: "SAR",
        rate: n + 1,
      })),
    });
    const query = "q=benchmark%2060mm%20concrete%20paver";
    await search(query);
    const result = await search(query);
    expect(result.total).toBe(5000);
    expect(result.rows).toHaveLength(50);
    expect(result.stats).toMatchObject({
      median: 2500.5,
      min: 1,
      max: 5000,
      unit: "m²",
    });
    expect(result.elapsedMs).toBeLessThan(500);
    const last = await search(`${query}&page=9999`);
    expect(last.page).toBe(100);
    expect(last.rows).toHaveLength(50);
    expect(last.stats).toEqual(result.stats);
  }, 20000);
});
