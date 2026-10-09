import { randomUUID } from "node:crypto";
import type { Currency } from "@prisma/client";
import type { ExtractResult, Flag, Issue } from "./extraction-schema";

/**
 * Turns an extraction into database rows (bills › sections › main
 * descriptions › items › rates), with ids assigned up front so every table
 * can be written with one bulk insert. Pure — no database access.
 */
export type IngestPlan = {
  bills: { id: string; documentId: string; billNo: string; title: string; sortOrder: number }[];
  sections: { id: string; billId: string; parentHeading: string | null; heading: string | null; sortOrder: number }[];
  mainDescriptions: { id: string; sectionId: string; text: string; pageFrom: number; pageTo: number; sortOrder: number }[];
  items: {
    id: string;
    documentId: string;
    mainDescriptionId: string;
    itemRef: string;
    description: string;
    fullDescription: string;
    unitRaw: string | null;
    unit: string | null;
    qty: string | null;
    page: number;
    sortOrder: number;
    flags: Flag[];
  }[];
  rates: { id: string; itemId: string; rate: string | null; amount: string | null; rateNote: string | null; currency: Currency }[];
  counts: { items: number; errors: number; warnings: number };
};

export function planIngest(result: ExtractResult, documentId: string, currency: Currency, newId: () => string = randomUUID): IngestPlan {
  const plan: IngestPlan = { bills: [], sections: [], mainDescriptions: [], items: [], rates: [], counts: { items: 0, errors: 0, warnings: 0 } };
  let itemOrder = 0;

  result.bills.forEach((bill, b) => {
    const billId = newId();
    plan.bills.push({ id: billId, documentId, billNo: bill.bill_no, title: bill.title, sortOrder: b });
    bill.sections.forEach((section, s) => {
      const sectionId = newId();
      plan.sections.push({ id: sectionId, billId, parentHeading: section.parent_heading, heading: section.heading, sortOrder: s });
      section.main_descriptions.forEach((md, m) => {
        const mdId = newId();
        plan.mainDescriptions.push({ id: mdId, sectionId, text: md.text, pageFrom: md.page_from, pageTo: md.page_to, sortOrder: m });
        for (const item of md.items) {
          const itemId = newId();
          plan.items.push({
            id: itemId,
            documentId,
            mainDescriptionId: mdId,
            itemRef: item.ref,
            description: item.description,
            fullDescription: item.full_description,
            unitRaw: item.unit_raw,
            unit: item.unit,
            qty: item.qty,
            page: item.page,
            sortOrder: itemOrder++,
            flags: item.flags,
          });
          if (item.rate !== null || item.amount !== null || item.rate_note !== null) {
            plan.rates.push({ id: newId(), itemId, rate: item.rate, amount: item.amount, rateNote: item.rate_note, currency });
          }
          plan.counts.errors += item.flags.filter((f) => f.severity === "error").length;
          plan.counts.warnings += item.flags.filter((f) => f.severity === "warning").length;
        }
      });
    });
  });

  plan.counts.items = plan.items.length;
  plan.counts.errors += countIssues(result.issues, "error");
  plan.counts.warnings += countIssues(result.issues, "warning");
  return plan;
}

function countIssues(issues: Issue[], severity: Issue["severity"]) {
  return issues.filter((i) => i.severity === severity).length;
}
