import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, CircleAlert, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/session";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import { failStaleJobs } from "@/lib/extraction-runner";
import { flagSchema, issueSchema, type Flag } from "@/lib/extraction-schema";
import { z } from "zod";
import { StatusBadge } from "../status-badge";
import { ExtractionProgress, UploadActions } from "./upload-client";

export const metadata: Metadata = { title: "Upload" };

const flagsOf = (v: unknown): Flag[] => z.array(flagSchema).catch([]).parse(v);

function num(v: { toString(): string } | null | undefined) {
  if (v === null || v === undefined) return "";
  const n = Number(v.toString());
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function money(v: { toString(): string } | null | undefined) {
  if (v === null || v === undefined) return "";
  return Number(v.toString()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FlagBadges({ flags }: { flags: Flag[] }) {
  const shown = flags.filter((f) => f.severity !== "info");
  if (!shown.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((f) => (
        <Badge key={f.code} tone={f.severity === "error" ? "danger" : "warning"} title={f.message}>
          {f.message.length > 42 ? `${f.message.slice(0, 40)}…` : f.message}
        </Badge>
      ))}
    </span>
  );
}

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  await failStaleJobs(id);

  const doc = await prisma.boqDocument.findUnique({
    where: { id },
    include: {
      project: { include: { city: true, country: true, buildingType: true } },
      stage: true,
      uploadedBy: { select: { name: true } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!doc) notFound();

  const extracted = doc.status === "REVIEW" || doc.status === "PUBLISHED";
  const bills = extracted
    ? await prisma.bill.findMany({
        where: { documentId: id },
        orderBy: { sortOrder: "asc" },
        include: {
          sections: {
            orderBy: { sortOrder: "asc" },
            include: {
              mainDescriptions: {
                orderBy: { sortOrder: "asc" },
                include: { items: { orderBy: { sortOrder: "asc" }, include: { rates: { where: { bidderId: null }, take: 1 } } } },
              },
            },
          },
        },
      })
    : [];
  const issues = z.array(issueSchema).catch([]).parse(doc.issues ?? []);
  const priced = bills.some((b) => b.sections.some((s) => s.mainDescriptions.some((m) => m.items.some((i) => i.rates[0]?.rate != null))));

  return (
    <>
      <Link href="/uploads" className="mb-3 inline-flex items-center gap-1 text-[13px] text-qs-text-muted hover:text-qs-text">
        <ChevronLeft className="size-4" aria-hidden /> Uploads
      </Link>
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] leading-tight font-[600] sm:text-[22px]">{doc.title}</h1>
            <StatusBadge status={doc.status} />
          </div>
          <p className="mt-1.5 text-[13.5px] text-qs-text-muted">
            <span className="font-[550] text-qs-text-secondary">{doc.project.name}</span>
            {doc.project.projectNo ? ` (${doc.project.projectNo})` : ""} · {doc.stage.name} · {doc.rateType === "PTE" ? "PTE" : "Tender return"} · BOQ date{" "}
            {formatDate(doc.boqDate)} · {doc.currency}
          </p>
          <p className="mt-0.5 text-[12.5px] text-qs-text-faint">
            {doc.project.city.name}, {doc.project.country.name} · {doc.project.buildingType.name} · uploaded by {doc.uploadedBy.name} on {formatDateTime(doc.createdAt)} · {doc.fileName}
          </p>
        </div>
        <UploadActions id={doc.id} status={doc.status} rateCount={doc.status === "PUBLISHED" ? await prisma.rate.count({ where: { item: { documentId: doc.id } } }) : 0} />
      </header>

      {doc.status === "PROCESSING" ? <ExtractionProgress id={doc.id} initialStep={doc.jobs[0]?.step ?? "Waiting to start"} /> : null}

      {doc.status === "FAILED" ? (
        <div className="qs-card flex items-start gap-3 border-qs-danger/40 px-5 py-4">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-qs-danger" aria-hidden />
          <div>
            <h2 className="text-[15px] font-[600]">The extraction didn&apos;t finish</h2>
            <p className="mt-1 text-[13.5px] text-qs-text-secondary">{doc.failureMessage ?? "Something went wrong."}</p>
            <p className="mt-2 text-[12.5px] text-qs-text-muted">Try extracting again. If it keeps failing, delete the upload and check the file.</p>
          </div>
        </div>
      ) : null}

      {extracted ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {[
              ["Items", doc.itemCount.toLocaleString()],
              ["Bills", bills.length],
              ["Errors", doc.errorCount],
              ["Warnings", doc.warningCount],
            ].map(([label, value]) => (
              <div key={label} className="qs-card px-4 py-3.5">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-qs-text-muted uppercase">{label}</p>
                <p
                  className={`mt-1.5 text-[24px] leading-none font-[600] tabular-nums ${
                    label === "Items" ? "text-qs-brand-text" : label === "Errors" && Number(value) > 0 ? "text-qs-danger" : label === "Warnings" && Number(value) > 0 ? "text-qs-warning" : ""
                  }`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-qs-info-bg px-4 py-3 text-[13px] text-qs-info">
            <Info className="mt-px size-4 shrink-0" aria-hidden />
            <p>
              {doc.status === "REVIEW" ? <>Check the source, correct flagged items and confirm each item before publishing. <Link href={`/uploads/${id}/review`} className="font-semibold underline">Open review workspace →</Link></> : <>This BOQ is published. <Link href={`/documents/${id}`} className="font-semibold underline">View document →</Link></>}
            </p>
          </div>

          {issues.length ? (
            <div className="qs-card mb-4 px-5 py-4">
              <h2 className="flex items-center gap-2 text-[15px] font-[600]">
                <AlertTriangle className="size-4 text-qs-warning" aria-hidden /> Document checks
              </h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
                {issues.map((issue, i) => (
                  <li key={i} className="flex gap-2">
                    <Badge tone={issue.severity === "error" ? "danger" : "warning"}>{issue.severity === "error" ? "Error" : "Warning"}</Badge>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {bills.map((bill, b) => (
              <details key={bill.id} open={b === 0} className="qs-card group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
                  <span className="text-[11.5px] font-[600] tracking-[0.08em] text-qs-text-muted uppercase">Bill {bill.billNo}</span>
                  <span className="flex-1 truncate text-[15px] font-[600]">{bill.title}</span>
                  <span className="text-[12.5px] text-qs-text-muted tabular-nums">
                    {plural(bill.sections.reduce((n, s) => n + s.mainDescriptions.reduce((m, md) => m + md.items.length, 0), 0), "item")}
                  </span>
                  <ChevronLeft className="size-4 -rotate-90 text-qs-text-muted transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="border-t border-qs-border">
                  {bill.sections.map((section) => (
                    <div key={section.id} className="border-b border-qs-border last:border-b-0">
                      {section.heading || section.parentHeading ? (
                        <h3 className="bg-qs-raised px-5 pt-3 pb-2 text-[13.5px] font-[600]">
                          {section.parentHeading ? <span className="font-normal text-qs-text-muted">{section.parentHeading} › </span> : null}
                          {section.heading}
                        </h3>
                      ) : null}
                      {section.mainDescriptions.map((md) => (
                        <div key={md.id}>
                          {md.text ? <p className="px-5 pt-2.5 pb-1 text-[13px] leading-relaxed text-qs-text-secondary">{md.text}</p> : null}
                          <div className="overflow-x-auto">
                            <table className="qs-table min-w-[520px]">
                              <thead className="sr-only">
                                <tr>
                                  <th>Item</th>
                                  <th>Description</th>
                                  <th>Quantity</th>
                                  <th>Unit</th>
                                  {priced ? <th>Rate</th> : null}
                                  {priced ? <th>Amount</th> : null}
                                  <th>Page</th>
                                </tr>
                              </thead>
                              <tbody>
                                {md.items.map((item) => {
                                  const rate = item.rates[0];
                                  return (
                                    <tr key={item.id}>
                                      <td className="w-12 pl-5 font-[600] text-qs-text-secondary">{item.itemRef}</td>
                                      <td>
                                        <span className={item.description ? "" : "text-qs-text-faint italic"}>{item.description || "No description"}</span>
                                        <FlagBadges flags={flagsOf(item.flags)} />
                                      </td>
                                      <td className="qs-num w-24">{num(item.qty)}</td>
                                      <td className="w-16 text-qs-text-muted">{item.unit ?? item.unitRaw ?? ""}</td>
                                      {priced ? <td className="qs-num w-28">{rate?.rateNote ?? money(rate?.rate)}</td> : null}
                                      {priced ? <td className="qs-num w-32">{money(rate?.amount)}</td> : null}
                                      <td className="w-16 pr-5 text-right text-[11.5px] whitespace-nowrap text-qs-text-faint tabular-nums">{doc.fileType === "xlsx" ? `sheet ${item.page}` : `p${item.page}`}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
