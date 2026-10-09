import { Prisma } from "@prisma/client";
import { flagsOf } from "./review-validation";
import type { Flag } from "./extraction-schema";
const recalculated = new Set([
  "EMPTY_DESCRIPTION",
  "MISSING_QTY",
  "MISSING_UNIT",
  "UNKNOWN_UNIT",
  "AMOUNT_MISMATCH",
  "AMOUNT_MISSING",
  "RATE_MISSING",
]);
export function validateItem(
  item: {
    description: string;
    unit: string | null;
    qty: string | null;
    rate: string | null;
    amount: string | null;
    rateNote: string | null;
  },
  existing: unknown,
): Flag[] {
  const flags = flagsOf(existing).filter((f) => !recalculated.has(f.code));
  const add = (code: string, severity: Flag["severity"], message: string) =>
    flags.push({ code, severity, message });
  if (!item.description.trim())
    add("EMPTY_DESCRIPTION", "error", "This item has no description.");
  if (item.qty === null && !item.rateNote)
    add("MISSING_QTY", "warning", "No quantity found.");
  if (!item.unit) add("MISSING_UNIT", "warning", "No unit found.");
  if (item.qty !== null && item.rate !== null && item.amount !== null) {
    const expected = new Prisma.Decimal(item.qty).mul(item.rate);
    const amount = new Prisma.Decimal(item.amount);
    const tolerance = Prisma.Decimal.max(amount.abs().mul("0.01"), "0.01");
    if (expected.sub(amount).abs().gt(tolerance))
      add(
        "AMOUNT_MISMATCH",
        "error",
        `Quantity × rate (${expected.toFixed(2)}) doesn't match the amount (${amount.toFixed(2)}).`,
      );
  } else if (item.rate !== null && item.amount === null)
    add("AMOUNT_MISSING", "warning", "Has a rate but no amount.");
  else if (item.amount !== null && item.rate === null)
    add("RATE_MISSING", "warning", "Has an amount but no rate.");
  return flags;
}
