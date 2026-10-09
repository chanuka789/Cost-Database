import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/session";
import { reviewData } from "@/lib/review-data";
import { ReviewWorkspace } from "./review-workspace";
export const metadata = { title: "Review BOQ" };
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const doc = await reviewData(id);
  if (!doc) notFound();
  if (doc.status === "PUBLISHED") redirect(`/documents/${id}`);
  if (doc.status !== "REVIEW") redirect(`/uploads/${id}`);
  return (
    <>
      <Link
        href={`/uploads/${id}`}
        className="mb-3 inline-block text-[13px] text-qs-text-muted"
      >
        ← Upload details
      </Link>
      <ReviewWorkspace doc={doc} />
    </>
  );
}
