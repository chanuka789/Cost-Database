import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prisma } from "./prisma";
import { applyReview } from "./review-service";
import { flagKey, type ReviewAction } from "./review-validation";
// Integration checks are opt-in and refuse a remote database.
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl && !["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname))
  throw new Error("Review tests require a local test database.");
if (testUrl) process.env.DATABASE_URL = testUrl;
describe.skipIf(!testUrl)("review transaction integration", () => {
  let userId: string,
    projectId: string,
    documentId: string,
    otherId: string,
    group1: string,
    group2: string,
    item1: string,
    item2: string,
    item3: string;
  const issue = {
    code: "PAGE_TOTAL_MISMATCH",
    severity: "error",
    message: "Check the source total",
    page: 1,
  } as const;
  const execute = async (operation: ReviewAction) => {
    const doc = await prisma.boqDocument.findUniqueOrThrow({
      where: { id: documentId },
    });
    return applyReview(documentId, doc.reviewVersion, operation, userId);
  };
  beforeAll(async () => {
    const [country, city, buildingType, stage] = await Promise.all([
      prisma.country.findFirstOrThrow(),
      prisma.city.findFirstOrThrow(),
      prisma.buildingType.findFirstOrThrow(),
      prisma.stage.findFirstOrThrow(),
    ]);
    const user = await prisma.user.create({
      data: {
        name: "Review integration",
        email: `review-${Date.now()}@example.invalid`,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const project = await prisma.project.create({
      data: {
        name: `Review integration ${Date.now()}`,
        projectDate: new Date("2026-01-01"),
        countryId: country.id,
        cityId: city.id,
        buildingTypeId: buildingType.id,
        createdById: userId,
      },
    });
    projectId = project.id;
    const base = {
      projectId,
      title: "Review test",
      rateType: "PTE" as const,
      stageId: stage.id,
      boqDate: new Date("2026-01-01"),
      currency: "SAR" as const,
      status: "REVIEW" as const,
      fileKey: "test",
      fileName: "test.pdf",
      fileSize: 1,
      fileType: "pdf",
      uploadedById: userId,
    };
    const doc = await prisma.boqDocument.create({
      data: { ...base, fileSha256: `test-${Date.now()}`, issues: [issue] },
    });
    documentId = doc.id;
    const other = await prisma.boqDocument.create({
      data: { ...base, fileSha256: `other-${Date.now()}` },
    });
    otherId = other.id;
    const bill = await prisma.bill.create({
      data: { documentId, billNo: "01", title: "External works", sortOrder: 0 },
    });
    const section = await prisma.section.create({
      data: { billId: bill.id, heading: "Paving", sortOrder: 0 },
    });
    const g1 = await prisma.mainDescription.create({
      data: {
        sectionId: section.id,
        text: "Pavers",
        pageFrom: 1,
        pageTo: 1,
        sortOrder: 0,
      },
    });
    group1 = g1.id;
    const g2 = await prisma.mainDescription.create({
      data: {
        sectionId: section.id,
        text: "Edgings",
        pageFrom: 1,
        pageTo: 1,
        sortOrder: 1,
      },
    });
    group2 = g2.id;
    const make = async (ref: string, order: number, group: string) =>
      prisma.boqItem.create({
        data: {
          documentId,
          mainDescriptionId: group,
          itemRef: ref,
          description: "Red paver",
          fullDescription: "Original",
          unit: "m²",
          qty: "10",
          page: 1,
          sortOrder: order,
          flags:
            ref === "A"
              ? [
                  {
                    code: "AMOUNT_MISMATCH",
                    severity: "error",
                    message: "Mismatch",
                  },
                ]
              : [],
          rates: {
            create: {
              rate: "5",
              amount: ref === "A" ? "40" : "50",
              currency: "SAR",
            },
          },
        },
      });
    [item1, item2, item3] = (
      await Promise.all([
        make("A", 0, group1),
        make("B", 1, group1),
        make("C", 2, group2),
      ])
    ).map((i) => i.id);
  });
  afterAll(async () => {
    if (projectId) {
      await prisma.boqDocument.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });
  it("blocks unreviewed publishing and checking unresolved item errors", async () => {
    await expect(execute({ action: "publish" })).rejects.toThrow(
      "Check every item",
    );
    await expect(
      execute({ action: "check", itemIds: [item1], checked: true }),
    ).rejects.toThrow("Fix or explicitly accept");
  });
  it("fixes arithmetic without changing entered values", async () => {
    await execute({
      action: "item",
      itemId: item1,
      fields: {
        itemRef: "A",
        description: "Red paver",
        unit: "m²",
        qty: "10",
        rate: "5",
        amount: "50",
        rateNote: null,
      },
    });
    const item = await prisma.boqItem.findUniqueOrThrow({
      where: { id: item1 },
      include: { rates: true },
    });
    expect(item.flags).toEqual([]);
    expect(item.rates[0].amount?.toString()).toBe("50");
  });
  it("rejects stale versions and cross-document changes atomically", async () => {
    await expect(
      applyReview(
        documentId,
        0,
        { action: "group", groupId: group1, text: "Lost edit" },
        userId,
      ),
    ).rejects.toThrow("Another reviewer");
    await expect(
      applyReview(
        otherId,
        0,
        { action: "check", itemIds: [item1], checked: true },
        userId,
      ),
    ).rejects.toThrow("doesn't belong");
    expect(
      (
        await prisma.mainDescription.findUniqueOrThrow({
          where: { id: group1 },
        })
      ).text,
    ).toBe("Pavers");
  });
  it("rebuilds shared descriptions and invalidates checked children", async () => {
    await execute({ action: "check", itemIds: [item1, item2], checked: true });
    await execute({
      action: "group",
      groupId: group1,
      text: "Concrete pavers",
    });
    const items = await prisma.boqItem.findMany({
      where: { mainDescriptionId: group1 },
    });
    expect(
      items.every(
        (i) =>
          i.fullDescription.includes("Concrete pavers") && i.checkedAt === null,
      ),
    ).toBe(true);
  });
  it("serializes two reviewers and permits only one write at a shared version", async () => {
    const doc = await prisma.boqDocument.findUniqueOrThrow({
      where: { id: documentId },
    });
    const results = await Promise.allSettled([
      applyReview(
        documentId,
        doc.reviewVersion,
        { action: "group", groupId: group1, text: "Concrete pavers" },
        userId,
      ),
      applyReview(
        documentId,
        doc.reviewVersion,
        { action: "group", groupId: group1, text: "Concrete pavers" },
        userId,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("splits and merges without losing items or decimal rates", async () => {
    await execute({ action: "split", itemIds: [item2], text: "Blue pavers" });
    const split = (
      await prisma.boqItem.findUniqueOrThrow({ where: { id: item2 } })
    ).mainDescriptionId;
    expect(split).not.toBe(group1);
    await execute({
      action: "merge",
      groupIds: [group1, split],
      text: "Concrete paving",
    });
    expect(
      (await prisma.boqItem.findUniqueOrThrow({ where: { id: item2 } }))
        .mainDescriptionId,
    ).toBe(group1);
    expect(await prisma.boqItem.count({ where: { documentId } })).toBe(3);
  });
  it("moves items and bulk edits units while resetting checks", async () => {
    await execute({ action: "move", itemIds: [item3], groupId: group1 });
    await execute({
      action: "unit",
      itemIds: [item1, item2, item3],
      unit: "m2",
    });
    expect(
      (await prisma.boqItem.findUniqueOrThrow({ where: { id: item3 } }))
        .fullDescription,
    ).toContain("Concrete paving");
    expect(await prisma.mainDescription.count({ where: { id: group2 } })).toBe(
      1,
    );
  });
  it("requires document error acceptance before publishing and logs it", async () => {
    await execute({
      action: "check",
      itemIds: [item1, item2, item3],
      checked: true,
    });
    await expect(execute({ action: "publish" })).rejects.toThrow(
      "Resolve or explicitly accept",
    );
    await execute({
      action: "accept",
      key: flagKey(issue),
      reason: "Checked against the original source total",
    });
    await execute({ action: "publish" });
    const doc = await prisma.boqDocument.findUniqueOrThrow({
      where: { id: documentId },
    });
    expect(doc.status).toBe("PUBLISHED");
    expect(doc.publishedById).toBe(userId);
    expect(doc.publishedAt).not.toBeNull();
    expect(doc.errorCount).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { entityId: documentId, action: "document.published" },
      }),
    ).toBe(1);
    await expect(
      execute({
        action: "group",
        groupId: group1,
        text: "Change after publication",
      }),
    ).rejects.toThrow("Only BOQs in review");
  });
});
