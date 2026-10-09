import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_TTL_MS, generateToken, hashToken, tokenExpiry, tokenState } from "./tokens";

describe("auth tokens", () => {
  it("generates long, unique, URL-safe tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically and never returns the raw token", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expires 48 hours after issue", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    expect(tokenExpiry(now).getTime() - now.getTime()).toBe(AUTH_TOKEN_TTL_MS);
    expect(AUTH_TOKEN_TTL_MS).toBe(48 * 3600 * 1000);
  });

  it("reports used, expired and valid states", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    expect(tokenState({ usedAt: null, expiresAt: new Date("2026-10-10T10:00:00Z") }, now)).toBe("valid");
    expect(tokenState({ usedAt: now, expiresAt: new Date("2026-10-10T10:00:00Z") }, now)).toBe("used");
    expect(tokenState({ usedAt: null, expiresAt: now }, now)).toBe("expired");
  });
});
