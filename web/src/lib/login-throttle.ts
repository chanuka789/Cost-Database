/** After this many wrong passwords in a row the account is locked for a while. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export function isLockedOut(lockedUntil: Date | null, now = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function minutesLeft(lockedUntil: Date, now = new Date()): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
}

/** Next counter value and lock time after one more failed attempt. */
export function afterFailedLogin(
  failedCount: number,
  now = new Date(),
): { failedLoginCount: number; lockedUntil: Date | null } {
  const next = failedCount + 1;
  if (next >= MAX_FAILED_LOGINS) {
    return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60000) };
  }
  return { failedLoginCount: next, lockedUntil: null };
}

/**
 * Per-address limit, kept in memory: enough for one app instance, and stops
 * one address from guessing across many accounts.
 */
const addressFailures = new Map<string, { count: number; resetAt: number }>();
const ADDRESS_LIMIT = 20;
const ADDRESS_WINDOW_MS = 15 * 60000;

export function addressBlocked(address: string, now = Date.now()): boolean {
  const entry = addressFailures.get(address);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= ADDRESS_LIMIT;
}

export function recordAddressFailure(address: string, now = Date.now()) {
  const entry = addressFailures.get(address);
  if (!entry || entry.resetAt <= now) addressFailures.set(address, { count: 1, resetAt: now + ADDRESS_WINDOW_MS });
  else entry.count += 1;
}
