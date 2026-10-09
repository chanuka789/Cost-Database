import { prisma } from "./prisma";
import { acceptancesOf, flagsOf, issuesOf } from "./review-validation";
export async function reviewData(id: string) {
  const doc = await prisma.boqDocument.findUnique({
    where: { id },
    include: {
      project: true,
      stage: true,
      bills: {
        orderBy: { sortOrder: "asc" },
        include: {
          sections: {
            orderBy: { sortOrder: "asc" },
            include: {
              mainDescriptions: {
                orderBy: { sortOrder: "asc" },
                include: {
                  items: {
                    orderBy: { sortOrder: "asc" },
                    include: { rates: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    projectId: doc.projectId,
    projectName: doc.project.name,
    stage: doc.stage.name,
    currency: doc.currency,
    boqDate: doc.boqDate.toISOString().slice(0, 10),
    status: doc.status,
    fileType: doc.fileType,
    pageCount: doc.pageCount,
    version: doc.reviewVersion,
    issues: issuesOf(doc.issues),
    acceptedIssues: acceptancesOf(doc.acceptedIssues),
    bills: doc.bills.map((b) => ({
      id: b.id,
      billNo: b.billNo,
      title: b.title,
      sections: b.sections.map((s) => ({
        id: s.id,
        heading: s.heading,
        parentHeading: s.parentHeading,
        groups: s.mainDescriptions.map((m) => ({
          id: m.id,
          text: m.text,
          pageFrom: m.pageFrom,
          pageTo: m.pageTo,
          items: m.items.map((i) => ({
            id: i.id,
            itemRef: i.itemRef,
            description: i.description,
            fullDescription: i.fullDescription,
            unit: i.unit,
            qty: i.qty?.toString() ?? null,
            page: i.page,
            flags: flagsOf(i.flags),
            acceptedFlags: acceptancesOf(i.acceptedFlags),
            checked: !!i.checkedAt,
            aiTouched: i.aiTouched,
            rate: i.rates.find((r) => !r.bidderId)?.rate?.toString() ?? null,
            amount:
              i.rates.find((r) => !r.bidderId)?.amount?.toString() ?? null,
            rateNote: i.rates.find((r) => !r.bidderId)?.rateNote ?? null,
          })),
        })),
      })),
    })),
  };
}
export type ReviewData = NonNullable<Awaited<ReturnType<typeof reviewData>>>;
export type ReviewItem =
  ReviewData["bills"][number]["sections"][number]["groups"][number]["items"][number];
