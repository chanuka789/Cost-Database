import { it, expect } from "vitest";
import { excelNumber } from "./rate-export";
it("preserves numbers beyond Excel precision as text", () => {
  expect(excelNumber("1234567890123456.12")).toBe("1234567890123456.12");
  expect(excelNumber("12345.6700")).toBe(12345.67);
  expect(excelNumber("0.0001")).toBe(0.0001);
  expect(excelNumber(null)).toBeNull();
});
