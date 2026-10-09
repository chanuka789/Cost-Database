import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { parseSearch } from "@/lib/rate-search";
import { searchOptions, searchRates } from "@/lib/rate-search-service";
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
  const [options, result] = await Promise.all([
    searchOptions(),
    searchRates(filters),
  ]);
  return (
    <RateSearchWorkspace
      userId={user.id}
      admin={user.role === "ADMIN"}
      initialFilters={filters}
      initialResult={result}
      options={options}
      initialError={error}
    />
  );
}
