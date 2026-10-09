import type { Metadata } from "next";
import { Search } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Rate search" };

export default async function RateSearchPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="Rate search"
        description="Find rates from published BOQs by item, project, location, building type, stage and date."
      />
      <EmptyState
        icon={Search}
        title="No rates yet"
        description={
          user.role === "ADMIN"
            ? "Rates appear here once BOQs are uploaded, reviewed and published. BOQ upload is being built next."
            : "Rates appear here once an admin publishes BOQs."
        }
      />
    </>
  );
}
