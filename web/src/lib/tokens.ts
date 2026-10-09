import { createHash, randomBytes } from "node:crypto";

/** Invite and reset links stay valid for 48 hours. */
export const AUTH_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

/** A new random token for a link. Only its hash is stored in the database. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + AUTH_TOKEN_TTL_MS);
}

export type TokenState = "valid" | "used" | "expired";

export function tokenState(token: { usedAt: Date | null; expiresAt: Date }, now = new Date()): TokenState {
  if (token.usedAt) return "used";
  if (token.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}
