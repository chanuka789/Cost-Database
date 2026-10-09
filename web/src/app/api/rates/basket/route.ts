import { getCurrentUser } from "@/lib/session";
import { exportSchema } from "@/lib/rate-search";
import { basketRates } from "@/lib/rate-search-service";
export async function POST(request: Request) {
  if (!(await getCurrentUser()))
    return Response.json(
      { error: "Sign in to view your basket." },
      { status: 401 },
    );
  const parsed = exportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Select between 1 and 500 distinct rates." },
      { status: 400 },
    );
  const rows = await basketRates(parsed.data.rateIds, parsed.data.currency);
  return Response.json(
    { rows },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
