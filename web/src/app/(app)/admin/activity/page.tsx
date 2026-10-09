import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { describeAction } from "./describe";

export const metadata: Metadata = { title: "Activity log" };

const PAGE_SIZE = 50;
const AREAS = [
  { key: "all", label: "All" },
  { key: "auth", label: "Sign-ins" },
  { key: "user", label: "Users" },
  { key: "lists", label: "Lists" },
] as const;

function areaFilter(area: string): Prisma.AuditLogWhereInput {
  if (area === "auth") return { action: { startsWith: "auth." } };
  if (area === "user") return { action: { startsWith: "user." } };
  if (area === "lists") {
    return { OR: ["country.", "city.", "buildingType.", "stage."].map((p) => ({ action: { startsWith: p } })) };
  }
  return {};
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ area?: string; page?: string }> }) {
  await requireAdminPage();
  const params = await searchParams;
  const area = AREAS.some((a) => a.key === params.area) ? params.area! : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where = areaFilter(area);

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);

  // Names for entries that point at a user, so "Invited Sara" reads naturally.
  const userIds = [...new Set(entries.filter((e) => e.entity === "user" && e.entityId).map((e) => e.entityId!))];
  const targets = new Map(
    (await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/admin/activity?area=${area}&page=${p}`;

  return (
    <>
      <PageHeader title="Activity log" description="Who did what, newest first. Entries can't be edited or deleted." />
      <nav className="qs-segmented mb-4 w-fit" aria-label="Filter activity">
        {AREAS.map((a) => (
          <Link key={a.key} href={`/admin/activity?area=${a.key}`} className="qs-segmented-item" data-active={area === a.key ? "" : undefined} aria-current={area === a.key ? "page" : undefined}>
            {a.label}
          </Link>
        ))}
      </nav>
      <div className="qs-card overflow-x-auto">
        <table className="qs-table min-w-[640px]">
          <thead>
            <tr>
              <th className="w-48">When</th>
              <th className="w-48">Who</th>
              <th>What</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-10 text-center text-qs-text-muted">
                  No activity yet.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-qs-text-muted tabular-nums">{formatDateTime(e.createdAt)}</td>
                  <td className="font-[500]">{e.user?.name ?? "System"}</td>
                  <td>{describeAction(e, e.entityId ? targets.get(e.entityId) : undefined)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-[13px] text-qs-text-muted">
          <span className="tabular-nums">
            Page {page} of {pages} · {total} entries
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={href(page - 1)} className="inline-flex h-[34px] items-center gap-1 rounded-md border border-qs-border-strong bg-qs-panel px-3 text-qs-text hover:bg-qs-hover">
                <ChevronLeft className="size-4" aria-hidden /> Newer
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={href(page + 1)} className="inline-flex h-[34px] items-center gap-1 rounded-md border border-qs-border-strong bg-qs-panel px-3 text-qs-text hover:bg-qs-hover">
                Older <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
