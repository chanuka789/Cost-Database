import ExcelJS from "exceljs";
import { usdPegs, type DisplayCurrency, type RateRow } from "./rate-search";

export function excelNumber(value: string | null) {
  if (value === null) return null;
  // Excel only preserves 15 significant digits. Keep larger source values as text.
  const significant = value
    .replace(/^-/, "")
    .replace(".", "")
    .replace(/^0+/, "")
    .replace(/0+$/, "");
  return significant.length > 15 ? value : Number(value);
}

export async function exportRateWorkbook(
  rows: RateRow[],
  currency: DisplayCurrency,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QSGS Cost Database";
  const sheet = workbook.addWorksheet("Rates", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const definitions = [
    ["projectName", "Project name", 28],
    ["projectNo", "Project number", 18],
    ["projectDate", "Project date", 16],
    ["projectDatePrecision", "Project date precision", 20],
    ["country", "Country", 24],
    ["city", "City", 18],
    ["buildingType", "Building type", 22],
    ["rateType", "Rate type", 14],
    ["bidderId", "Bidder", 18],
    ["stage", "Stage", 18],
    ["boqDate", "BOQ date", 16],
    ["billNo", "Bill", 10],
    ["billTitle", "Bill title", 28],
    ["itemRef", "Item ref", 12],
    ["fullDescription", "Full description", 80],
    ["unit", "Unit", 12],
    ["qty", "Quantity", 16],
    ["rate", `Rate (${currency})`, 18],
    ["amount", `Amount (${currency})`, 20],
    ["rateNote", "Rate note", 22],
    ["originalCurrency", "Source currency", 18],
    ["originalRate", "Source rate", 18],
    ["originalAmount", "Source amount", 20],
    ["page", "Source page / sheet", 20],
    ["documentId", "Document ID", 30],
    ["itemId", "Item ID", 30],
  ] as const;
  sheet.columns = definitions.map(([key, header, width]) => ({
    key,
    header,
    width,
  }));
  for (const row of rows) {
    const value: Record<string, unknown> = { ...row };
    for (const key of [
      "qty",
      "rate",
      "amount",
      "originalRate",
      "originalAmount",
    ] as const)
      value[key] = excelNumber(row[key]);
    // Plain strings remain literal text, including text beginning with '='.
    const added = sheet.addRow(value);
    added.alignment = { vertical: "top", wrapText: true };
    for (const key of ["qty", "rate", "originalRate"] as const)
      added.getCell(key).numFmt = "#,##0.0000";
    for (const key of ["amount", "originalAmount"] as const)
      added.getCell(key).numFmt = "#,##0.00";
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0A5083" },
  };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: definitions.length },
  };
  const notes = workbook.addWorksheet("Conversion");
  notes.columns = [
    { header: "Setting", key: "setting", width: 30 },
    { header: "Value", key: "value", width: 85 },
  ];
  notes.addRows([
    { setting: "Display currency", value: currency },
    {
      setting: "Fixed USD pegs",
      value: Object.entries(usdPegs)
        .map(([c, v]) => `${v} ${c}`)
        .join(" = "),
    },
    {
      setting: "Conversion",
      value:
        "Source value × target USD peg ÷ source USD peg. Source values are unchanged.",
    },
    { setting: "Exported at (UTC)", value: new Date().toISOString() },
    {
      setting: "Source",
      value:
        "Published BOQs in QSGS Cost Database; identify each item with document and item IDs.",
    },
    {
      setting: "Numeric precision",
      value:
        "Numbers exceeding Excel's 15 significant digits are exported as exact text.",
    },
  ]);
  notes.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  return workbook.xlsx.writeBuffer();
}
