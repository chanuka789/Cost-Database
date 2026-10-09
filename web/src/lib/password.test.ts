import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password";

describe("password rules", () => {
  it("accepts a reasonable password", () => {
    expect(passwordProblem("Riyadh2026paving")).toBeNull();
  });
  it("needs 10+ characters", () => {
    expect(passwordProblem("abc12345")).toMatch(/at least 10/);
  });
  it("needs letters and numbers", () => {
    expect(passwordProblem("onlyletterspassword")).toMatch(/letters and numbers/);
    expect(passwordProblem("12345678901")).toMatch(/letters and numbers/);
  });
  it("rejects the email name inside the password", () => {
    expect(passwordProblem("chanuka2026!", "chanuka@qsgs.com")).toMatch(/email/);
  });
});
