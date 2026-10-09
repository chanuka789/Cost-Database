import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { audit } from "./audit";
import {
  acceptancesOf,
  flagKey,
  flagsOf,
  fullDescription,
  issuesOf,
  unresolved,
  type ReviewAction,
} from "./review-validation";
import { validateItem } from "./review-checks";

export class ReviewError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export async function lockDocument(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM boq_documents WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.boqDocument.findUnique({ where: { id } });
  if (!doc) throw new ReviewError("BOQ not found.", 404);
  return doc;
}
const reset = { checkedAt: null, checkedById: null, acceptedFlags: [] };
export async function applyReview(
  id: string,
  version: number,
  op: ReviewAction,
  userId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const doc = await lockDocument(tx, id);
      if (doc.status !== "REVIEW")
        throw new ReviewError(
          "Only BOQs in review can be changed or published.",
        );
      if (doc.reviewVersion !== version)
        throw new ReviewError(
          "Another reviewer changed this BOQ. Refresh and try again.",
        );
      const getItems = async (itemIds: string[]) => {
        const items = await tx.boqItem.findMany({
          where: { documentId: id, id: { in: itemIds } },
          include: {
            rates: true,
            mainDescription: { include: { section: true } },
          },
        });
        if (items.length !== itemIds.length)
          throw new ReviewError("An item doesn't belong to this BOQ.", 400);
        return items;
      };
      const getGroup = async (groupId: string) => {
        const group = await tx.mainDescription.findFirst({
          where: { id: groupId, section: { bill: { documentId: id } } },
          include: { section: true },
        });
        if (!group)
          throw new ReviewError(
            "Main description doesn't belong to this BOQ.",
            400,
          );
        return group;
      };
      const rebuild = async (groupIds: string[]) => {
        const items = await tx.boqItem.findMany({
          where: { documentId: id, mainDescriptionId: { in: groupIds } },
          include: { mainDescription: { include: { section: true } } },
        });
        for (const item of items) {
          const md = item.mainDescription;
          await tx.boqItem.update({
            where: { id: item.id },
            data: {
              ...reset,
              fullDescription: fullDescription(
                md.section.parentHeading,
                md.section.heading,
                md.text,
                item.description,
              ),
            },
          });
        }
      };
      if (op.action === "item") {
        const [item] = await getItems([op.itemId]);
        if (item.rates.some((r) => r.bidderId))
          throw new ReviewError("Tender rates are reviewed in a later phase.");
        const { rate, amount, rateNote, ...fields } = op.fields;
        const md = item.mainDescription;
        await tx.boqItem.update({
          where: { id: item.id },
          data: {
            ...fields,
            ...reset,
            unitRaw: fields.unit,
            flags: validateItem(op.fields, item.flags),
            fullDescription: fullDescription(
              md.section.parentHeading,
              md.section.heading,
              md.text,
              fields.description,
            ),
          },
        });
        const data = { rate, amount, rateNote, currency: doc.currency };
        if (item.rates[0])
          await tx.rate.update({ where: { id: item.rates[0].id }, data });
        else if (rate !== null || amount !== null || rateNote)
          await tx.rate.create({ data: { ...data, itemId: item.id } });
        // Page totals cannot be safely dismissed by changing one rate: re-check them against the source.
        await tx.boqDocument.update({
          where: { id },
          data: { acceptedIssues: [] },
        });
      } else if (op.action === "group") {
        await getGroup(op.groupId);
        await tx.mainDescription.update({
          where: { id: op.groupId },
          data: { text: op.text },
        });
        await rebuild([op.groupId]);
      } else if (op.action === "section") {
        const section = await tx.section.findFirst({
          where: { id: op.sectionId, bill: { documentId: id } },
          include: { mainDescriptions: true },
        });
        if (!section)
          throw new ReviewError("Section doesn't belong to this BOQ.", 400);
        await tx.section.update({
          where: { id: section.id },
          data: { heading: op.heading, parentHeading: op.parentHeading },
        });
        await rebuild(section.mainDescriptions.map((m) => m.id));
      } else if (op.action === "bill") {
        const bill = await tx.bill.findFirst({
          where: { id: op.billId, documentId: id },
        });
        if (!bill)
          throw new ReviewError("Bill doesn't belong to this BOQ.", 400);
        await tx.bill.update({
          where: { id: bill.id },
          data: { billNo: op.billNo, title: op.title },
        });
        await tx.boqItem.updateMany({
          where: {
            documentId: id,
            mainDescription: { section: { billId: bill.id } },
          },
          data: reset,
        });
      } else if (op.action === "check") {
        const items = await getItems(op.itemIds);
        if (
          op.checked &&
          items.some((i) =>
            unresolved(flagsOf(i.flags), i.acceptedFlags).some(
              (f) => f.severity === "error",
            ),
          )
        )
          throw new ReviewError(
            "Fix or explicitly accept item errors before marking it checked.",
          );
        await tx.boqItem.updateMany({
          where: { id: { in: op.itemIds } },
          data: {
            checkedAt: op.checked ? new Date() : null,
            checkedById: op.checked ? userId : null,
          },
        });
      } else if (op.action === "unit") {
        for (const item of await getItems(op.itemIds)) {
          const rate = item.rates.find((r) => !r.bidderId);
          const flags = validateItem(
            {
              description: item.description,
              unit: op.unit,
              qty: item.qty?.toString() ?? null,
              rate: rate?.rate?.toString() ?? null,
              amount: rate?.amount?.toString() ?? null,
              rateNote: rate?.rateNote ?? null,
            },
            item.flags,
          );
          await tx.boqItem.update({
            where: { id: item.id },
            data: { unit: op.unit, unitRaw: op.unit, flags, ...reset },
          });
        }
      } else if (op.action === "move" || op.action === "split") {
        const items = await getItems(op.itemIds);
        let target;
        if (op.action === "move") target = await getGroup(op.groupId);
        else {
          const source = items[0].mainDescription;
          if (
            items.some((i) => i.mainDescriptionId !== source.id) ||
            items.length ===
              (await tx.boqItem.count({
                where: { mainDescriptionId: source.id },
              }))
          )
            throw new ReviewError(
              "Select some, but not all, items from one group to split.",
              400,
            );
          await tx.mainDescription.updateMany({
            where: {
              sectionId: source.sectionId,
              sortOrder: { gt: source.sortOrder },
            },
            data: { sortOrder: { increment: 1 } },
          });
          target = await tx.mainDescription.create({
            data: {
              sectionId: source.sectionId,
              text: op.text,
              pageFrom: Math.min(...items.map((i) => i.page)),
              pageTo: Math.max(...items.map((i) => i.page)),
              sortOrder: source.sortOrder + 1,
            },
            include: { section: true },
          });
        }
        for (const item of items)
          await tx.boqItem.update({
            where: { id: item.id },
            data: {
              ...reset,
              mainDescriptionId: target.id,
              fullDescription: fullDescription(
                target.section.parentHeading,
                target.section.heading,
                target.text,
                item.description,
              ),
            },
          });
      } else if (op.action === "merge") {
        if (op.groupIds.length < 2)
          throw new ReviewError("Select at least two groups.", 400);
        const groups = await Promise.all(op.groupIds.map(getGroup));
        if (groups.some((g) => g.sectionId !== groups[0].sectionId))
          throw new ReviewError(
            "Only groups in the same section can be merged.",
            400,
          );
        const target = groups.sort((a, b) => a.sortOrder - b.sortOrder)[0];
        await tx.mainDescription.update({
          where: { id: target.id },
          data: { text: op.text },
        });
        await tx.boqItem.updateMany({
          where: { documentId: id, mainDescriptionId: { in: op.groupIds } },
          data: { mainDescriptionId: target.id },
        });
        await tx.mainDescription.deleteMany({
          where: { id: { in: op.groupIds.filter((g) => g !== target.id) } },
        });
        await rebuild([target.id]);
      } else if (op.action === "accept") {
        const item = op.itemId ? (await getItems([op.itemId]))[0] : null;
        const flags = item ? flagsOf(item.flags) : issuesOf(doc.issues);
        if (!flags.some((f) => flagKey(f) === op.key))
          throw new ReviewError(
            "This check changed. Refresh before accepting it.",
          );
        const accepted = [
          ...acceptancesOf(
            item ? item.acceptedFlags : doc.acceptedIssues,
          ).filter((a) => a.key !== op.key),
          {
            key: op.key,
            reason: op.reason,
            userId,
            at: new Date().toISOString(),
          },
        ];
        if (item)
          await tx.boqItem.update({
            where: { id: item.id },
            data: { acceptedFlags: accepted },
          });
        else
          await tx.boqDocument.update({
            where: { id },
            data: { acceptedIssues: accepted },
          });
      } else if (op.action === "publish") {
        if (doc.rateType !== "PTE")
          throw new ReviewError(
            "Tender publishing requires bidder mapping in Phase 6.",
          );
        const items = await tx.boqItem.findMany({ where: { documentId: id } });
        if (!items.length || items.some((i) => !i.checkedAt))
          throw new ReviewError("Check every item before publishing.");
        if (
          unresolved(issuesOf(doc.issues), doc.acceptedIssues).some(
            (f) => f.severity === "error",
          ) ||
          items.some((i) =>
            unresolved(flagsOf(i.flags), i.acceptedFlags).some(
              (f) => f.severity === "error",
            ),
          )
        )
          throw new ReviewError(
            "Resolve or explicitly accept all errors before publishing.",
          );
        await tx.boqDocument.update({
          where: { id },
          data: {
            status: "PUBLISHED",
            publishedById: userId,
            publishedAt: new Date(),
          },
        });
      }
      // Keep group page spans and summary counts in sync after any review operation.
      const items = await tx.boqItem.findMany({
        where: { documentId: id },
        select: {
          mainDescriptionId: true,
          page: true,
          flags: true,
          acceptedFlags: true,
        },
      });
      const spans = new Map<string, number[]>();
      for (const item of items) {
        const pages = spans.get(item.mainDescriptionId) ?? [];
        pages.push(item.page);
        spans.set(item.mainDescriptionId, pages);
      }
      for (const [groupId, pages] of spans)
        await tx.mainDescription.update({
          where: { id: groupId },
          data: { pageFrom: Math.min(...pages), pageTo: Math.max(...pages) },
        });
      const updated = await tx.boqDocument.findUniqueOrThrow({ where: { id } });
      const allFlags = [
        ...unresolved(issuesOf(updated.issues), updated.acceptedIssues),
        ...items.flatMap((i) => unresolved(flagsOf(i.flags), i.acceptedFlags)),
      ];
      await tx.boqDocument.update({
        where: { id },
        data: {
          reviewVersion: { increment: 1 },
          itemCount: items.length,
          errorCount: allFlags.filter((f) => f.severity === "error").length,
          warningCount: allFlags.filter((f) => f.severity === "warning").length,
        },
      });
      await audit(
        {
          userId,
          action:
            op.action === "publish"
              ? "document.published"
              : `review.${op.action}`,
          entity: "document",
          entityId: id,
          details: op as Prisma.InputJsonValue,
        },
        tx,
      );
      return { ok: true, version: version + 1 };
    },
    { timeout: 30000 },
  );
}
