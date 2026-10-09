import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function ProjectsPage() {
  const user = await requireUser();
  // Users only see BOQs once published; admins also see those still in review.
  const visible = user.role === "ADMIN" ? {} : { status: "PUBLISHED" as const };
  const projects = await prisma.project.findMany({
    orderBy: { projectDate: "desc" },
    where: user.role === "ADMIN" ? {} : { documents: { some: { status: "PUBLISHED" } } },
    select: {
      id: true,
      name: true,
      projectNo: true,
      projectDate: true,
      projectDatePrecision: true,
      client: true,
      city: { select: { name: true } },
      country: { select: { name: true } },
      buildingType: { select: { name: true } },
      documents: { where: visible, select: { stage: { select: { name: true, sortOrder: true } } } },
    },
  });

  return (
    <>
      <PageHeader title="Projects" description="Every project with its location, building type and BOQs by stage. Project pages come with the review step." />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={user.role === "ADMIN" ? "Projects are created when you upload their first BOQ." : "Projects appear here once an admin publishes their BOQs."}
        />
      ) : (
        <div className="qs-card overflow-x-auto">
          <table className="qs-table min-w-[760px]">
            <thead>
              <tr>
                <th>Project</th>
                <th>Location</th>
                <th>Building type</th>
                <th>Project date</th>
                <th>BOQs</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const stages = [...new Map(p.documents.map((d) => [d.stage.name, d.stage.sortOrder])).entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="block font-[550]">{p.name}</span>
                      <span className="text-[11.5px] text-qs-text-faint">{[p.projectNo, p.client].filter(Boolean).join(" · ") || "—"}</span>
                    </td>
                    <td>
                      {p.city.name}
                      <span className="block text-[11.5px] text-qs-text-faint">{p.country.name}</span>
                    </td>
                    <td>{p.buildingType.name}</td>
                    <td className="whitespace-nowrap tabular-nums">{p.projectDatePrecision === "MONTH" ? MONTH.format(p.projectDate) : formatDate(p.projectDate)}</td>
                    <td>
                      {plural(p.documents.length, "BOQ")}
                      {stages.length ? <span className="block text-[11.5px] text-qs-text-faint">{stages.join(" → ")}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
