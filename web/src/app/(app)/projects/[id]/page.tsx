import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate, plural } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../../uploads/status-badge";
export const metadata = { title: "Project" };
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const admin = user.role === "ADMIN";
  const project = await prisma.project.findFirst({
    where: {
      id,
      ...(!admin ? { documents: { some: { status: "PUBLISHED" } } } : {}),
    },
    include: {
      city: true,
      country: true,
      buildingType: true,
      documents: {
        where: admin ? {} : { status: "PUBLISHED" },
        orderBy: [{ stage: { sortOrder: "asc" } }, { boqDate: "desc" }],
        include: { stage: true, publishedBy: { select: { name: true } } },
      },
    },
  });
  if (!project) notFound();
  const projectDate =
    project.projectDatePrecision === "MONTH"
      ? new Intl.DateTimeFormat("en-GB", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(project.projectDate)
      : formatDate(project.projectDate);
  return (
    <>
      <Link
        href="/projects"
        className="mb-3 inline-block text-[13px] text-qs-text-muted"
      >
        ← Projects
      </Link>
      <PageHeader
        title={project.name}
        description={[
          project.projectNo,
          `${project.city.name}, ${project.country.name}`,
          project.buildingType.name,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          admin ? (
            <Button asChild>
              <Link href={`/uploads/new?projectId=${id}`}>Upload BOQ</Link>
            </Button>
          ) : undefined
        }
      />
      <dl className="qs-card mb-4 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        {[
          ["Project date", projectDate],
          ["Client", project.client ?? "—"],
          ["Consultant", project.consultant ?? "—"],
          ["BOQs", String(project.documents.length)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-qs-text-muted">{label}</dt>
            <dd className="mt-1 text-[14px] font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {project.notes ? (
        <p className="mb-4 text-[13px] text-qs-text-secondary">
          {project.notes}
        </p>
      ) : null}
      <h2 className="mb-3 text-[16px] font-semibold">BOQs by stage</h2>
      <div className="space-y-3">
        {project.documents.map((doc) => (
          <div
            key={doc.id}
            className="qs-card flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={
                    doc.status === "PUBLISHED"
                      ? `/documents/${doc.id}`
                      : `/uploads/${doc.id}`
                  }
                  className="text-[15px] font-semibold text-qs-brand-text hover:underline"
                >
                  {doc.title}
                </Link>
                <StatusBadge status={doc.status} />
              </div>
              <p className="mt-1 text-[13px] text-qs-text-muted">
                {doc.stage.name} ·{" "}
                {doc.rateType === "PTE" ? "PTE" : "Tender return"} ·{" "}
                {formatDate(doc.boqDate)} · {doc.currency} ·{" "}
                {plural(doc.itemCount, "item")}
              </p>
              {doc.publishedAt ? (
                <p className="mt-1 text-[12px] text-qs-text-faint">
                  Published {formatDate(doc.publishedAt)} by{" "}
                  {doc.publishedBy?.name ?? "Admin"}
                </p>
              ) : null}
            </div>
            {admin && doc.status === "REVIEW" ? (
              <Button variant="outline" asChild>
                <Link href={`/uploads/${doc.id}/review`}>
                  Review and publish
                </Link>
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
