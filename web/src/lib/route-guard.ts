import "server-only";
import { NextResponse } from "next/server";
import { AuthError, requireAdmin, type CurrentUser } from "./session";

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * For API routes that change data: the caller must be a signed-in admin, and
 * the request must come from this app (Origin check), not another website.
 */
export async function guardAdmin(req: Request): Promise<CurrentUser | NextResponse> {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host || new URL(origin).host !== host) return jsonError("Request blocked.", 403);
  }
  try {
    return await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.message.startsWith("Only admins") ? 403 : 401);
    throw e;
  }
}
