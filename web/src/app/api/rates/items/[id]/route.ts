import { getCurrentUser } from "@/lib/session";
import { currencies, type DisplayCurrency } from "@/lib/rate-search";
import { rateDetail } from "@/lib/rate-search-service";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getCurrentUser()))
    return Response.json({ error: "Sign in to view rates." }, { status: 401 });
  const currency = new URL(request.url).searchParams.get("currency") ?? "SAR";
  if (!currencies.includes(currency as DisplayCurrency))
    return Response.json({ error: "Invalid currency." }, { status: 400 });
  const detail = await rateDetail(
    (await params).id,
    currency as DisplayCurrency,
  );
  if (!detail)
    return Response.json({ error: "Item not found." }, { status: 404 });
  return Response.json(detail, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
