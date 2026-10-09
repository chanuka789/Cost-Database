import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/session";
import { UploadForm, type UploadFormData } from "./upload-form";

export const metadata: Metadata = { title: "Upload BOQ" };

export default async function NewUploadPage() {
  await requireAdminPage();
  const [projects, countries, buildingTypes, stages] = await Promise.all([
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        projectNo: true,
        city: { select: { name: true } },
        country: { select: { currency: true } },
        buildingType: { select: { name: true } },
      },
    }),
    prisma.country.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        currency: true,
        cities: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } },
      },
    }),
    prisma.buildingType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.stage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const data: UploadFormData = {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      projectNo: p.projectNo,
      city: p.city.name,
      buildingType: p.buildingType.name,
      currency: p.country.currency,
    })),
    countries,
    buildingTypes,
    stages,
  };

  return (
    <>
      <PageHeader
        title="Upload BOQ"
        description="Choose the file first — we read its cover and fill in what we can. Then check the details and start the extraction."
      />
      <UploadForm data={data} />
    </>
  );
}
