import { describe, expect, it } from "vitest";
import { adminChangeProblem } from "./admin-rules";

const admin = { id: "a1", role: "ADMIN" as const, status: "ACTIVE" as const };
const other = { id: "a2", role: "ADMIN" as const, status: "ACTIVE" as const };
const user = { id: "u1", role: "USER" as const, status: "ACTIVE" as const };

describe("admin safety rules", () => {
  it("blocks disabling yourself", () => {
    expect(adminChangeProblem("a1", admin, { status: "DISABLED" }, 3)).toMatch(/your own/);
  });
  it("blocks removing your own admin role", () => {
    expect(adminChangeProblem("a1", admin, { role: "USER" }, 3)).toMatch(/your own/);
  });
  it("blocks demoting or disabling the last active admin", () => {
    expect(adminChangeProblem("x", other, { role: "USER" }, 1)).toMatch(/last active admin/);
    expect(adminChangeProblem("x", other, { status: "DISABLED" }, 1)).toMatch(/last active admin/);
  });
  it("allows demoting an admin when others remain", () => {
    expect(adminChangeProblem("a1", other, { role: "USER" }, 2)).toBeNull();
  });
  it("allows promoting and disabling normal users", () => {
    expect(adminChangeProblem("a1", user, { role: "ADMIN" }, 1)).toBeNull();
    expect(adminChangeProblem("a1", user, { status: "DISABLED" }, 1)).toBeNull();
  });
});
