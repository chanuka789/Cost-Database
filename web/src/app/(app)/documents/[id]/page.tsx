import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { reviewData } from "@/lib/review-data";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
export const metadata = { title: "BOQ document" };
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const doc = await reviewData(id);
  if (!doc) notFound();
  if (doc.status !== "PUBLISHED") {
    if (user.role === "ADMIN") redirect(`/uploads/${id}`);
    notFound();
  }
  return (
    <>
      <Link
        href={`/projects/${doc.projectId}`}
        className="mb-3 inline-block text-[13px] text-qs-brand-text"
      >
        ← {doc.projectName}
      </Link>
      <PageHeader
        title={doc.title}
        description={`${doc.projectName} · ${doc.stage} · BOQ date ${doc.boqDate} · ${doc.currency}`}
      />
      <div className="mb-4 flex items-center gap-3">
        <Badge tone="success">Published</Badge>
        <a
          className="text-[13px] text-qs-brand-text"
          href={`/api/uploads/${id}/file`}
          target="_blank"
          rel="noopener"
        >
          Original BOQ ↗
        </a>
      </div>
      <div className="space-y-4">
        {doc.bills.map((bill) => (
          <section key={bill.id} className="qs-card overflow-hidden">
            <h2 className="border-b border-qs-border bg-qs-raised p-4 text-[15px] font-semibold">
              Bill {bill.billNo} · {bill.title}
            </h2>
            {bill.sections.map((section) => (
              <div key={section.id}>
                <h3 className="p-4 pb-2 text-[14px] font-semibold">
                  {[section.parentHeading, section.heading]
                    .filter(Boolean)
                    .join(" › ")}
                </h3>
                {section.groups.map((group) => (
                  <div key={group.id}>
                    <p className="px-4 py-2 text-[13px] text-qs-text-secondary">
                      {group.text}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="qs-table min-w-[680px]">
                        <thead>
                          <tr>
                            <th>Ref</th>
                            <th>Item description</th>
                            <th>Unit</th>
                            <th className="qs-num">Quantity</th>
                            <th className="qs-num">Rate ({doc.currency})</th>
                            <th className="qs-num">Amount</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.itemRef}</td>
                              <td title={item.fullDescription}>
                                {item.description}
                              </td>
                              <td>{item.unit ?? "—"}</td>
                              <td className="qs-num">{item.qty ?? "—"}</td>
                              <td className="qs-num">
                                {item.rateNote ?? item.rate ?? "—"}
                              </td>
                              <td className="qs-num">{item.amount ?? "—"}</td>
                              <td>
                                {doc.fileType === "pdf" ? "p" : "sheet "}
                                {item.page}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
