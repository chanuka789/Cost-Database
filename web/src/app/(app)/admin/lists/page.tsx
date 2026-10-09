import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/session";
import { SimpleList } from "./simple-list";
import { Locations } from "./locations";

export const metadata: Metadata = { title: "Lists" };

const TABS = [
  { key: "locations", label: "Locations" },
  { key: "building-types", label: "Building types" },
  { key: "stages", label: "Project stages" },
] as const;

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdminPage();
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab! : "locations";

  return (
    <>
      <PageHeader
        title="Lists"
        description="The choices admins pick from when uploading a BOQ. Hidden items stay on BOQs already tagged with them but aren't offered for new uploads."
      />
      <nav className="qs-segmented mb-4 w-fit" aria-label="Lists">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/lists?tab=${t.key}`} className="qs-segmented-item" aria-current={tab === t.key ? "page" : undefined} data-active={tab === t.key ? "" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "locations" ? (
        <Locations
          countries={(
            await prisma.country.findMany({
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              include: { cities: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
            })
          ).map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            currency: c.currency,
            active: c.active,
            cities: c.cities.map((x) => ({ id: x.id, name: x.name, active: x.active })),
          }))}
        />
      ) : tab === "building-types" ? (
        <SimpleList
          list="buildingType"
          noun="building type"
          placeholder="Data centre"
          ordered={false}
          items={(await prisma.buildingType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })).map((x) => ({
            id: x.id,
            name: x.name,
            active: x.active,
          }))}
        />
      ) : (
        <SimpleList
          list="stage"
          noun="stage"
          placeholder="Schematic 75%"
          ordered
          hint="Keep stages in project order — filters and project pages show them in this order."
          items={(await prisma.stage.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })).map((x) => ({
            id: x.id,
            name: x.name,
            active: x.active,
          }))}
        />
      )}
    </>
  );
}
