import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/admin/users?x=1")).toBe("/admin/users?x=1");
  });
  it("rejects other sites and tricks", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) {
      expect(safeRedirectPath(bad as string)).toBe("/");
    }
  });
  it("never loops back to sign-in or into the API", () => {
    expect(safeRedirectPath("/login")).toBe("/");
    expect(safeRedirectPath("/api/auth/session")).toBe("/");
  });
});
