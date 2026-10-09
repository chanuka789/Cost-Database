import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Pages anyone can open. Everything else needs a session. */
const PUBLIC_PATHS = ["/login", "/set-password", "/forgot-password", "/reset-password"];

/**
 * First gate only: sends visitors without a session to sign-in. Every page,
 * action and API route still checks the user against the database itself
 * (lib/session.ts), so a disabled user or old session is refused there.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, the auth endpoints and static files. The upload API is
  // skipped too: the proxy buffers request bodies and cuts them at 10 MB, which
  // would corrupt large BOQs. Those routes check the admin session themselves.
  matcher: ["/((?!api/auth|api/uploads|_next/static|_next/image|brand/|icon.png|favicon.ico).*)"],
};
