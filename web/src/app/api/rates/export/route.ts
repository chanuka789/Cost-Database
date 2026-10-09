import { getCurrentUser } from "@/lib/session";
import { exportSchema } from "@/lib/rate-search";
import { basketRates } from "@/lib/rate-search-service";
import { exportRateWorkbook } from "@/lib/rate-export";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to export rates." },
      { status: 401 },
    );
  const parsed = exportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Select between 1 and 500 distinct rates." },
      { status: 400 },
    );
  const rows = await basketRates(parsed.data.rateIds, parsed.data.currency);
  if (rows.length !== parsed.data.rateIds.length)
    return Response.json(
      {
        error:
          "Some selected rates are no longer available. Refresh your basket.",
      },
      { status: 409 },
    );
  const buffer = await exportRateWorkbook(rows, parsed.data.currency);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="QSGS-rates-${parsed.data.currency}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
