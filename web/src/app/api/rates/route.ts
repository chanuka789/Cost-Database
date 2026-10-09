import { getCurrentUser } from "@/lib/session";
import { parseSearch } from "@/lib/rate-search";
import { searchRates } from "@/lib/rate-search-service";
export async function GET(request: Request) {
  if (!(await getCurrentUser()))
    return Response.json(
      { error: "Sign in to search rates." },
      { status: 401 },
    );
  let filters;
  try {
    filters = parseSearch(new URL(request.url).searchParams);
  } catch {
    return Response.json(
      { error: "Check your search filters and date ranges." },
      { status: 400 },
    );
  }
  return Response.json(await searchRates(filters), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
