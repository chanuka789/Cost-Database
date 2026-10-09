import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import type { Role, ThemePreference } from "@prisma/client";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  theme: ThemePreference;
};

/**
 * The signed-in user, re-checked against the database on every request. A
 * disabled user, or a session issued before a password or role change (older
 * sessionVersion), counts as signed out straight away.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, theme: true, status: true, sessionVersion: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  if (user.sessionVersion !== session.user.sessionVersion) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, theme: user.theme };
});

/** For pages: sends signed-out visitors to the sign-in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For admin pages: non-admins get the normal 404, so admin pages aren't advertised. */
export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  return user;
}

export class AuthError extends Error {}

/** For server actions and API routes: throws instead of redirecting. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Your session has ended. Sign in again.");
  if (user.role !== "ADMIN") throw new AuthError("Only admins can do this.");
  return user;
}

export async function requireSignedIn(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Your session has ended. Sign in again.");
  return user;
}
