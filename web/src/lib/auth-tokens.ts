import "server-only";
import type { AuthTokenType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { generateToken, hashToken, tokenExpiry, tokenState } from "./tokens";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Creates a new single-use link token and retires any earlier unused token of
 * the same type for that user, so only the newest link works.
 * Returns the raw token (for the link); only its hash is stored.
 */
export async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
  createdById: string | null,
  db: Db = prisma,
): Promise<string> {
  const now = new Date();
  await db.authToken.updateMany({ where: { userId, type, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
  const token = generateToken();
  await db.authToken.create({
    data: { userId, type, tokenHash: hashToken(token), expiresAt: tokenExpiry(now), createdById },
  });
  return token;
}

/** Looks up a link token. Returns the user it belongs to only while it is valid. */
export async function findValidToken(raw: string, type: AuthTokenType) {
  if (!raw || raw.length > 200) return { state: "invalid" as const };
  const token = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
  if (!token || token.type !== type) return { state: "invalid" as const };
  const state = tokenState(token);
  if (state !== "valid") return { state };
  return { state, token, user: token.user };
}

export function linkPath(type: AuthTokenType, token: string): string {
  return `${type === "INVITE" ? "/set-password" : "/reset-password"}?token=${encodeURIComponent(token)}`;
}
