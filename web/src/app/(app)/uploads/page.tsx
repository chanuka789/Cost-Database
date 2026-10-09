import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/session";
import { formatDate, plural } from "@/lib/format";
import { failStaleJobs } from "@/lib/extraction-runner";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Uploads" };

const UPLOAD_BUTTON =
  "inline-flex h-[34px] items-center gap-2 rounded-md bg-qs-brand px-3.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-qs-brand-hover focus-visible:shadow-[var(--qs-focus-ring)] focus-visible:outline-none";

export default async function UploadsPage() {
  await requireAdminPage();
  await failStaleJobs();
  const docs = await prisma.boqDocument.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      boqDate: true,
      itemCount: true,
      errorCount: true,
      warningCount: true,
      createdAt: true,
      rateType: true,
      project: { select: { name: true, projectNo: true } },
      stage: { select: { name: true } },
      uploadedBy: { select: { name: true } },
    },
  });

  const action = (
    <Link href="/uploads/new" className={UPLOAD_BUTTON}>
      <Upload className="size-4" aria-hidden />
      Upload BOQ
    </Link>
  );

  return (
    <>
      <PageHeader title="Uploads" description="Upload BOQs, check what was extracted and publish them to the database." actions={docs.length ? action : undefined} />
      {docs.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Upload your first BOQ"
          description="Upload a PDF or Excel BOQ. Items are extracted with their bill, heading and main description, ready for you to check."
          action={action}
        />
      ) : (
        <div className="qs-card overflow-x-auto">
          <table className="qs-table min-w-[880px]">
            <thead>
              <tr>
                <th>BOQ</th>
                <th>Project</th>
                <th>Stage</th>
                <th>BOQ date</th>
                <th className="qs-num">Items</th>
                <th>Checks</th>
                <th>Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="max-w-[260px]">
                    <Link href={`/uploads/${d.id}`} className="block truncate font-[550] text-qs-text hover:text-qs-brand-text hover:underline">
                      {d.title}
                    </Link>
                    <span className="text-[11.5px] text-qs-text-faint">{d.rateType === "PTE" ? "PTE" : "Tender return"}</span>
                  </td>
                  <td>
                    <span className="block truncate">{d.project.name}</span>
                    {d.project.projectNo ? <span className="text-[11.5px] text-qs-text-faint">{d.project.projectNo}</span> : null}
                  </td>
                  <td className="whitespace-nowrap">{d.stage.name}</td>
                  <td className="whitespace-nowrap tabular-nums">{formatDate(d.boqDate)}</td>
                  <td className="qs-num">{d.status === "PROCESSING" || d.status === "FAILED" ? "—" : d.itemCount}</td>
                  <td>
                    {d.status === "REVIEW" || d.status === "PUBLISHED" ? (
                      <span className="flex flex-wrap gap-1">
                        {d.errorCount ? <Badge tone="danger">{plural(d.errorCount, "error")}</Badge> : null}
                        {d.warningCount ? <Badge tone="warning">{plural(d.warningCount, "warning")}</Badge> : null}
                        {!d.errorCount && !d.warningCount ? <Badge tone="success">All clear</Badge> : null}
                      </span>
                    ) : (
                      <span className="text-qs-text-faint">—</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="whitespace-nowrap text-qs-text-muted">
                    {formatDate(d.createdAt)}
                    <span className="block text-[11.5px] text-qs-text-faint">{d.uploadedBy.name}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
