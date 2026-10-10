import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { hasSearchCriteria, parseSearch } from "@/lib/rate-search";
import { publishedSummary, searchOptions, searchRates } from "@/lib/rate-search-service";
import { RateSearchWorkspace } from "@/components/rates/search-workspace";

export const metadata: Metadata = { title: "Rate search" };

export default async function RateSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const values = await searchParams;
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value) params.set(key, value);
  });
  let filters;
  let error: string | undefined;
  try {
    filters = parseSearch(params);
  } catch {
    filters = parseSearch(new URLSearchParams());
    error = "Some URL filters were invalid and have been reset.";
  }
  // Nothing is listed until the user searches or picks a filter.
  const [options, result, summary] = await Promise.all([
    searchOptions(),
    hasSearchCriteria(filters) ? searchRates(filters) : null,
    publishedSummary(),
  ]);
  return (
    <RateSearchWorkspace
      userId={user.id}
      admin={user.role === "ADMIN"}
      initialFilters={filters}
      initialResult={result}
      summary={summary}
      options={options}
      initialError={error}
    />
  );
}
