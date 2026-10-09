"""Reads an Excel (.xlsx) BOQ into hierarchy events (see hierarchy.py).

Each visible sheet with a column header row (DESCRIPTION / QTY / UNIT …) is
read as one bill. Sheets without one (cover, summary) are skipped, except
that the first is used for cover guesses (project name, date, stage).

Rows:
- a row with an item reference or a quantity          -> an item
- description-only rows directly above an item whose own
  description cell is empty                           -> that item's text
- other description-only rows, grouped until a blank row -> a text block
  (heading or main description); bold cells read as bold
- "carried to collection" / total rows                 -> ignored

Tested on generated workbooks only — check the first real Excel BOQ
carefully and add it as a golden file (tests/test_golden.py).
"""

import re
from dataclasses import dataclass
from decimal import Decimal

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from .hierarchy import BillStart, Event, ItemRow, TextBlock
from .models import Cover, Issue, PageTotal
from .pdf_reader import ExtractError, guess_date, guess_stage

_BILL = re.compile(r"\bBILL\s*(?:NO\.?|NUMBER)?\s*[:.]?\s*(\d+[A-Z]?)\s*[-–:]\s*(.+)$", re.I)
_SKIP_ROW = re.compile(r"CARRIED\s+(TO|FORWARD)|BROUGHT\s+FORWARD|TO\s+COLLECTION|^\s*(SUB-?\s*)?TOTAL\b|^\s*COLLECTION\s*$", re.I)


@dataclass
class _Cols:
    ref: int | None
    desc: int
    qty: int
    unit: int
    rate: int | None
    amount: int | None
    header_row: int


@dataclass
class ExcelRead:
    events: list[Event]
    cover: Cover
    page_totals: list[PageTotal]
    issues: list[Issue]
    pages: int


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _num(value) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float, Decimal)):
        return str(Decimal(str(value)))
    return str(value).strip()


def _find_header(ws, max_rows: int = 40, mapping: dict | None = None) -> _Cols | None:
    for r, row in enumerate(ws.iter_rows(min_row=1, max_row=max_rows), start=1):
        if mapping:
            exact = {}
            for cell in row:
                label = _text(cell.value)
                if label:
                    exact.setdefault(label, []).append(cell.column)
            if all(v is None or len(exact.get(v, [])) == 1 for v in mapping.values()):
                def mapped(field):
                    label = mapping[field]
                    return exact[label][0] if label else None
                return _Cols(ref=mapped("reference"), desc=mapped("description"), qty=mapped("quantity"), unit=mapped("unit"), rate=mapped("rate"), amount=mapped("amount"), header_row=r)
            continue
        labels = {c.column: _text(c.value).upper() for c in row if _text(c.value)}

        def col(*names: str) -> int | None:
            for k, v in labels.items():
                if any(v == n or v.startswith(n + " ") or v.endswith(" " + n) or v == n + "." for n in names):
                    return k
            return None

        desc = next((k for k, v in labels.items() if "DESCRIPTION" in v), None)
        qty = col("QTY", "QUANTITY", "QTY.")
        unit = col("UNIT", "UOM", "UNITS")
        if desc and qty and unit:
            ref = col("ITEM", "ITEM NO", "REF", "NO", "S.NO", "SN", "ITEM REF")
            if ref == desc:
                ref = None
            return _Cols(ref=ref, desc=desc, qty=qty, unit=unit, rate=col("RATE", "UNIT RATE"), amount=col("AMOUNT", "TOTAL", "AMOUNT (SAR)", "AMOUNT (AED)", "AMOUNT (QAR)"), header_row=r)
    return None


def read_excel(path: str, column_mapping: dict | None = None) -> ExcelRead:
    try:
        wb = load_workbook(path, data_only=True)
    except InvalidFileException as e:
        raise ExtractError("UNSUPPORTED", "This Excel file can't be opened. Save it as .xlsx (Excel Workbook) and upload again.") from e
    except Exception as e:  # corrupt or password-protected
        raise ExtractError("UNREADABLE", "This Excel file can't be read. If it's password-protected, remove the password and upload again.") from e

    events: list[Event] = []
    issues: list[Issue] = []
    cover = Cover()
    cover_done = False
    sheets = [ws for ws in wb.worksheets if ws.sheet_state == "visible"]

    for sheet_no, ws in enumerate(sheets, start=1):
        cols = _find_header(ws, mapping=column_mapping)
        if cols is None:
            if not cover_done:
                text = " ".join(_text(c.value) for row in ws.iter_rows(max_row=60) for c in row if _text(c.value))
                first = next((_text(c.value) for row in ws.iter_rows(max_row=60) for c in row if _text(c.value)), None)
                stage_text, stage_guess = guess_stage(text)
                cover = Cover(project_name=first, boq_date=guess_date(text), stage_text=stage_text, stage_guess=stage_guess)
                cover_done = True
            continue

        bill_no, title = str(sheet_no).zfill(2), ws.title.strip()
        for row in ws.iter_rows(min_row=1, max_row=cols.header_row - 1):
            for c in row:
                m = _BILL.search(_text(c.value))
                if m:
                    bill_no, title = m.group(1).zfill(2), m.group(2).strip()
        events.append(BillStart(bill_no=bill_no, title=title))

        block: list[tuple[str, bool]] = []
        pending_text: list[tuple[str, bool]] = []  # desc-only rows right above a possible item

        def flush() -> None:
            nonlocal block
            if block:
                events.append(TextBlock(block, sheet_no))
                block = []

        for row in ws.iter_rows(min_row=cols.header_row + 1):
            cell = {c.column: c for c in row}

            def val(col: int | None):
                return cell[col].value if col and col in cell else None

            desc_cell = cell.get(cols.desc)
            desc = _text(val(cols.desc))
            ref = _text(val(cols.ref)) if cols.ref else ""
            qty, unit = _num(val(cols.qty)), _text(val(cols.unit))
            rate, amount = _num(val(cols.rate)), _num(val(cols.amount))
            bold = bool(desc_cell is not None and desc_cell.font is not None and desc_cell.font.b)

            if not (desc or ref or qty or unit or rate or amount):
                block.extend(pending_text)
                pending_text = []
                flush()
                continue
            if desc and _SKIP_ROW.search(desc) and not ref:
                continue
            if ref or qty is not None:
                lines = desc.splitlines() if desc else []
                if not lines and pending_text:
                    lines = [t for t, _ in pending_text]
                else:
                    block.extend(pending_text)
                pending_text = []
                flush()
                events.append(
                    ItemRow(ref=ref or "-", lines=lines, page=sheet_no, qty_raw=qty, unit_raw=unit or None, rate_raw=rate, amount_raw=amount)
                )
                continue
            # Description only.
            block.extend(pending_text)
            pending_text = [(line, bold) for line in desc.splitlines() if line.strip()]
        block.extend(pending_text)
        flush()

    if not any(isinstance(e, ItemRow) for e in events):
        raise ExtractError(
            "NO_ITEMS",
            "No BOQ items were found. Each bill sheet needs a header row with Description, Qty and Unit columns.",
        )
    return ExcelRead(events=events, cover=cover, page_totals=[], issues=issues, pages=len(sheets))
