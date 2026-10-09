"""Draws small BOQ PDFs for tests — no client data.

Mimics the layouts found in real BOQs: column header row, bill title, rows
where the item reference sits on the first line, in the middle of the
description, or above it, superscript units, and a "carried to collection"
footer with a page number.
"""

from dataclasses import dataclass, field

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

PAGE_H = letter[1]
X_REF, X_DESC, X_QTY, X_UNIT, X_RATE, X_AMOUNT = 108, 137, 395, 417, 470, 535  # qty/rate/amount right-aligned
PITCH = 10.5
ROW_GAP = 21.0


@dataclass
class Row:
    kind: str  # "heading" | "text" | "item"
    lines: list[str]
    ref: str | None = None
    qty: str | None = None
    unit: str | None = None
    rate: str | None = None
    amount: str | None = None
    ref_at: str = "top"  # item layout: "top" | "middle" | "above"
    bold: bool = False


@dataclass
class Page:
    bill: str
    rows: list[Row] = field(default_factory=list)
    footer_total: str = "-"


def _y(top: float) -> float:
    return PAGE_H - top - 8  # pdfplumber "top" ≈ reportlab baseline from the top, minus the ascent


def draw(path: str, pages: list[Page], cover: list[str] | None = None) -> None:
    c = canvas.Canvas(path, pagesize=letter)
    if cover:
        top = 300.0
        for text in cover:
            c.setFont("Helvetica", 14)
            c.drawString(200, _y(top), text)
            top += 30
        c.showPage()
    for n, page in enumerate(pages, start=1):
        c.setFont("Helvetica", 8)
        c.drawString(55, _y(25), "TEST PROJECT")
        c.setFont("Helvetica-Bold", 8)
        c.drawString(88, _y(67), page.bill)
        for x, label in ((96, "ITEM"), (115, "NO"), (215, "ITEM"), (234, "DESCRIPTION"), (366, "QUANTITY"), (413, "UNIT"), (453, "RATE"), (507, "AMOUNT")):
            c.drawString(x, _y(93), label)

        top = 120.0
        for row in page.rows:
            font = "Helvetica-Bold" if row.bold or row.kind == "heading" else "Helvetica"
            if row.kind in ("heading", "text"):
                for line in row.lines:
                    c.setFont(font, 8)
                    c.drawString(X_DESC, _y(top), line)
                    top += PITCH
                top += ROW_GAP - PITCH
                continue
            n_lines = len(row.lines)
            if row.ref_at == "above":
                ref_top, text_top = top, top + PITCH
                height = (n_lines + 1) * PITCH
            elif row.ref_at == "middle":
                text_top = top
                ref_top = top + (n_lines - 1) * PITCH / 2
                height = n_lines * PITCH
            else:
                ref_top = text_top = top
                height = n_lines * PITCH
            num_top = ref_top if row.ref_at != "top" else top + (n_lines - 1) * PITCH / 2
            c.setFont("Helvetica", 8)
            c.drawString(X_REF, _y(ref_top), row.ref or "")
            for i, line in enumerate(row.lines):
                c.drawString(X_DESC, _y(text_top + i * PITCH), line)
            if row.qty:
                c.drawRightString(X_QTY, _y(num_top), row.qty)
            if row.unit:
                base, sup = (row.unit[:-1], row.unit[-1]) if row.unit[-1] in "23" and len(row.unit) > 1 else (row.unit, "")
                c.drawString(X_UNIT, _y(num_top), base)
                if sup:
                    c.setFont("Helvetica", 5.4)
                    c.drawString(X_UNIT + c.stringWidth(base, "Helvetica", 8) + 0.5, _y(num_top - 2), sup)
                    c.setFont("Helvetica", 8)
            if row.rate:
                c.drawRightString(X_RATE, _y(num_top), row.rate)
            if row.amount:
                c.drawRightString(X_AMOUNT, _y(num_top), row.amount)
            top += height + ROW_GAP - PITCH

        c.setFont("Helvetica", 8)
        c.drawRightString(X_AMOUNT, _y(701), page.footer_total)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(160, _y(707), "CARRIED TO COLLECTION PAGE")
        c.setFont("Helvetica", 8)
        c.drawString(250, _y(759), f"B1/ {n}")
        c.showPage()
    c.save()
