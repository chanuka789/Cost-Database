import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Projects" description="Every project with its BOQs, by stage." />
      <EmptyState icon={FolderKanban} title="No projects yet" description="Projects are created when an admin uploads their first BOQ." />
    </>
  );
}
