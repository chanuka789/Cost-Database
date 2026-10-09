import { describe, expect, it } from "vitest";
import { addressBlocked, afterFailedLogin, isLockedOut, LOCKOUT_MINUTES, MAX_FAILED_LOGINS, recordAddressFailure } from "./login-throttle";

describe("login throttle", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  it("counts failures, then locks on the 5th", () => {
    let count = 0;
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      const r = afterFailedLogin(count, now);
      expect(r.lockedUntil).toBeNull();
      count = r.failedLoginCount;
    }
    const locked = afterFailedLogin(count, now);
    expect(locked.lockedUntil!.getTime() - now.getTime()).toBe(LOCKOUT_MINUTES * 60000);
    expect(locked.failedLoginCount).toBe(0);
  });
  it("knows when a lock has passed", () => {
    expect(isLockedOut(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLockedOut(new Date(now.getTime() - 1000), now)).toBe(false);
    expect(isLockedOut(null, now)).toBe(false);
  });
  it("blocks an address after 20 failures within 15 minutes", () => {
    const t = Date.now();
    for (let i = 0; i < 19; i++) recordAddressFailure("10.0.0.9", t);
    expect(addressBlocked("10.0.0.9", t)).toBe(false);
    recordAddressFailure("10.0.0.9", t);
    expect(addressBlocked("10.0.0.9", t)).toBe(true);
    expect(addressBlocked("10.0.0.9", t + 16 * 60000)).toBe(false);
  });
});
