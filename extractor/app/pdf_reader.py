"""Reads a text-based PDF BOQ into hierarchy events (see hierarchy.py).

How a page is read:
1. Find the column header row (ITEM NO / DESCRIPTION / QUANTITY / UNIT /
   RATE / AMOUNT) and take the column positions from it — they shift
   slightly between pages, so every page is measured on its own.
2. Ignore everything above the header (project name, bill title) and from
   the "CARRIED TO COLLECTION" footer down (page total, page number).
3. Group description words into lines, and lines into blocks separated by
   a vertical gap.
4. Item references (A, B, C…) and their numbers are centred vertically in
   their row, while description text starts at the top of the row. So in a
   block that contains references, each line belongs to the nearest
   reference, and each quantity / unit / rate / amount to the nearest
   reference too. Blocks without references are headings or main
   descriptions.
"""

import re
from collections import Counter
from dataclasses import dataclass, field

import pdfplumber

from .hierarchy import BillStart, Event, ItemRow, TextBlock
from .models import Cover, Issue, PageTotal
from .numbers import decimal_str, is_number_token, parse_number, rate_note

GAP = 15.0  # pt between lines that separates two blocks (normal line pitch ≈ 10.5)
SAME_LINE = 2.5  # pt: words this close vertically are on one line
NUMBER_REACH = 14.0  # pt: a number this close to an item reference belongs to it

_BILL = re.compile(r"\bBILL\s*(?:NO\.?|NUMBER)?\s*[:.]?\s*(\d+[A-Z]?)\s*[-–:]\s*(.+)$", re.I)
_PAGE_NO = re.compile(r"^[A-Z]{0,3}\d{0,3}\s*/\s*\d+$")
_SKIP_PAGE_TITLES = {"COLLECTION", "SUMMARY", "GENERAL SUMMARY", "GRAND SUMMARY", "BILL SUMMARY", "MAIN SUMMARY"}
_FOOTER = re.compile(r"CARRIED\s+(TO|FORWARD)|TO\s+COLLECTION|BROUGHT\s+FORWARD|TOTAL\s+CARRIED", re.I)


class ExtractError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Word:
    text: str
    x0: float
    x1: float
    top: float
    size: float
    bold: bool


@dataclass
class Line:
    top: float
    words: list[Word] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in sorted(self.words, key=lambda w: w.x0))

    @property
    def bold(self) -> bool:
        chars = sum(len(w.text) for w in self.words)
        return chars > 0 and sum(len(w.text) for w in self.words if w.bold) * 2 > chars


@dataclass
class Columns:
    desc: float
    qty: float
    unit: float
    rate: float
    amount: float
    header_bottom: float


def _words(page) -> list[Word]:
    return [
        Word(w["text"], w["x0"], w["x1"], w["top"], w["size"], "bold" in w["fontname"].lower())
        for w in page.extract_words(x_tolerance=1, extra_attrs=["fontname", "size"])
    ]


def _group_lines(words: list[Word]) -> list[Line]:
    lines: list[Line] = []
    for w in sorted(words, key=lambda w: (w.top, w.x0)):
        if lines and abs(w.top - lines[-1].top) <= SAME_LINE:
            lines[-1].words.append(w)
        else:
            lines.append(Line(w.top, [w]))
    return lines


def _find_columns(lines: list[Line]) -> Columns | None:
    def find(line: Line, *names: str) -> Word | None:
        # Header labels printed close together can merge into one word
        # ("ITEMDESCRIPTION"), so match on the end of the word too.
        for w in line.words:
            t = w.text.upper().strip(":.()")
            if t in names or any(t.endswith(n) and len(n) >= 4 for n in names):
                return w
        return None

    for line in lines[:12]:
        qty = find(line, "QUANTITY", "QTY")
        desc = find(line, "DESCRIPTION")
        unit = find(line, "UNIT")
        rate = find(line, "RATE")
        amount = find(line, "AMOUNT", "TOTAL")
        if not (qty and desc and unit and rate and amount):
            continue
        ref_words = [w for w in line.words if w.x1 < desc.x0 - 20]
        desc_start = (max(w.x1 for w in ref_words) + 5) if ref_words else desc.x0 - 40
        return Columns(
            desc=desc_start,
            qty=qty.x0 - 15,
            unit=unit.x0 - 6,
            rate=rate.x0 - 15,
            amount=amount.x0 - 15,
            header_bottom=line.top + 6,
        )
    return None


def _nearest(top: float, refs: list["_Ref"], reach: float | None = None) -> "_Ref | None":
    best: _Ref | None = None
    best_d = None
    for r in refs:
        d = abs(r.top - top)
        # Ties go to the later reference: text sits at the top of its row.
        if best_d is None or d < best_d or (d == best_d and r.top > best.top):  # type: ignore[union-attr]
            best, best_d = r, d
    if best is None or (reach is not None and best_d is not None and best_d > reach):
        return None
    return best


@dataclass
class _Ref:
    text: str
    top: float
    lines: list[Line] = field(default_factory=list)
    qty: list[Word] = field(default_factory=list)
    unit: list[Word] = field(default_factory=list)
    rate: list[Word] = field(default_factory=list)
    amount: list[Word] = field(default_factory=list)


def _top_aligned(ref: "_Ref") -> bool:
    """Quantities are always centred in their row. A quantity clearly below its
    reference means the reference sits on the row's first line."""
    nums = [w for w in ref.qty if is_number_token(w.text)]
    return bool(nums) and min(w.top for w in nums) - ref.top > 3


def _join_unit(words: list[Word]) -> str | None:
    if not words:
        return None
    body = max(w.size for w in words)
    out = ""
    for w in sorted(words, key=lambda w: (w.x0, w.top)):
        # Superscript 2 / 3 after m: "m" + "2" -> "m2".
        if w.size < body * 0.8 and w.text.isdigit():
            out += w.text
        else:
            out = f"{out} {w.text}".strip()
    return out or None


def _pick_number(words: list[Word], ref_top: float) -> str | None:
    nums = [w for w in words if is_number_token(w.text) or rate_note(w.text)]
    if not nums:
        return None
    return min(nums, key=lambda w: abs(w.top - ref_top)).text


@dataclass
class PdfRead:
    events: list[Event]
    cover: Cover
    page_totals: list[PageTotal]
    issues: list[Issue]
    pages: int


def read_pdf(path: str) -> PdfRead:
    events: list[Event] = []
    issues: list[Issue] = []
    page_totals: list[PageTotal] = []
    header_texts: Counter[str] = Counter()
    current_bill: str | None = None

    with pdfplumber.open(path) as pdf:
        if pdf.metadata.get("Encrypted"):
            raise ExtractError("ENCRYPTED", "This PDF is password-protected. Remove the password and upload it again.")
        pages = len(pdf.pages)
        sample = sum(len(p.chars) for p in pdf.pages[: min(5, pages)])
        if sample < 50:
            raise ExtractError(
                "NO_TEXT",
                "This PDF has no readable text — it looks like a scanned document. Upload the original PDF or Excel BOQ.",
            )
        cover = _read_cover(pdf.pages[0]) if pages else Cover()

        for page_no, page in enumerate(pdf.pages, start=1):
            lines = _group_lines(_words(page))
            cols = _find_columns(lines)
            if cols is None:
                continue

            # Above the header: repeated project name and the bill title.
            above = [l for l in lines if l.top < cols.header_bottom - 8]
            if above:
                header_texts[above[0].text.strip()] += 1
            for l in above:
                m = _BILL.search(l.text)
                if m:
                    bill_no = m.group(1).lstrip("0") or "0"
                    if bill_no != current_bill:
                        events.append(BillStart(bill_no=bill_no.zfill(2), title=m.group(2).strip()))
                        current_bill = bill_no

            body = [l for l in lines if l.top >= cols.header_bottom]
            footer_top = next((l.top for l in body if _FOOTER.search(l.text)), None)
            if footer_top is not None:
                total_words = [w for l in body if footer_top - 12 <= l.top <= footer_top + 3 for w in l.words if w.x0 >= cols.amount]
                total = next((w.text for w in total_words if is_number_token(w.text)), None)
                page_totals.append(
                    PageTotal(page=page_no, bill_no=current_bill.zfill(2) if current_bill else None, amount=decimal_str(parse_number(total)))
                )
                body = [l for l in body if l.top < footer_top - 8]
            body = [l for l in body if not _PAGE_NO.match(l.text.strip())]
            if any(l.text.strip().upper() in _SKIP_PAGE_TITLES for l in body[:6]):
                continue  # collection / summary page: no items

            events.extend(_read_page_body(body, cols, page_no, issues))

    # The project name is the text repeated at the top of every page.
    if header_texts:
        repeated, count = header_texts.most_common(1)[0]
        if count >= 2 and not _BILL.search(repeated):
            cover.project_name = repeated
    return PdfRead(events=events, cover=cover, page_totals=page_totals, issues=issues, pages=pages)


def _read_page_body(body: list[Line], cols: Columns, page_no: int, issues: list[Issue]) -> list[Event]:
    ref_words: list[Word] = []
    desc_words: list[Word] = []
    qty_words: list[Word] = []
    unit_words: list[Word] = []
    rate_words: list[Word] = []
    amount_words: list[Word] = []
    for line in body:
        for w in line.words:
            if w.x0 < cols.desc:
                ref_words.append(w)
            elif w.x0 < cols.qty:
                desc_words.append(w)
            elif w.x0 < cols.unit:
                (qty_words if is_number_token(w.text) else desc_words).append(w)
            elif w.x0 < cols.rate:
                unit_words.append(w)
            elif w.x0 < cols.amount:
                rate_words.append(w)
            else:
                amount_words.append(w)

    refs = [_Ref(text=" ".join(w.text for w in l.words), top=l.top) for l in _group_lines(ref_words)]
    desc_lines = _group_lines(desc_words)
    numbers = [*qty_words, *unit_words, *rate_words, *amount_words]

    # Rows: cut the page at vertical gaps using everything on it — text,
    # references and numbers. Layouts differ (reference at the top of the
    # row, in the middle, text above or below it) but rows are always
    # separated by a gap.
    marks = sorted([l.top for l in desc_lines] + [r.top for r in refs] + [w.top for w in numbers])
    spans: list[list[float]] = []
    for y in marks:
        if spans and y - spans[-1][1] <= GAP:
            spans[-1][1] = y
        else:
            spans.append([y, y])

    def span_of(top: float) -> tuple[float, float] | None:
        for lo, hi in spans:
            if lo - 0.5 <= top <= hi + 0.5:
                return lo, hi
        return None

    def refs_in(span: tuple[float, float]) -> list[_Ref]:
        return [r for r in refs if span[0] - 0.5 <= r.top <= span[1] + 0.5]

    # Numbers belong to an item in the same row.
    for words, attr in ((qty_words, "qty"), (unit_words, "unit"), (rate_words, "rate"), (amount_words, "amount")):
        for w in words:
            span = span_of(w.top)
            row_refs = refs_in(span) if span else []
            r = _nearest(w.top, row_refs) if row_refs else None
            if r is None:
                if is_number_token(w.text) and parse_number(w.text) is not None:
                    issues.append(
                        Issue(
                            code="ORPHAN_NUMBER",
                            severity="error",
                            message=f"A {attr} value ({w.text}) on page {page_no} isn't next to an item reference.",
                            page=page_no,
                        )
                    )
                continue
            getattr(r, attr).append(w)

    out: list[tuple[float, Event]] = []
    for span in spans:
        lo, hi = span
        block = [l for l in desc_lines if lo - 0.5 <= l.top <= hi + 0.5]
        row_refs = refs_in((lo, hi))
        if not block:
            continue
        if not row_refs:
            out.append((block[0].top, TextBlock([(l.text, l.bold) for l in block], page_no)))
            continue
        # A bold line at the start, well above the first reference, is a heading glued to the row.
        while len(block) > 1 and block[0].bold and row_refs[0].top - block[0].top > 8:
            head = block.pop(0)
            out.append((head.top, TextBlock([(head.text, True)], page_no)))

        if len(row_refs) == 1:
            row_refs[0].lines.extend(block)
        elif any(_top_aligned(r) for r in row_refs):
            # References mark the first line of their row: each row runs from
            # its reference down to the next one. Text above the first
            # reference isn't part of any item.
            lead = [l for l in block if l.top < row_refs[0].top - SAME_LINE]
            if lead:
                out.append((lead[0].top, TextBlock([(l.text, l.bold) for l in lead], page_no)))
            for line in block[len(lead):]:
                [r for r in row_refs if r.top <= line.top + SAME_LINE][-1].lines.append(line)
        else:
            # References centred in tightly packed rows: each line goes to the nearest one.
            for line in block:
                _nearest(line.top, row_refs).lines.append(line)  # type: ignore[union-attr]

    for r in refs:
        out.append(
            (
                r.top,
                ItemRow(
                    ref=r.text,
                    lines=[l.text for l in sorted(r.lines, key=lambda l: l.top)],
                    page=page_no,
                    qty_raw=_pick_number(r.qty, r.top),
                    unit_raw=_join_unit(r.unit),
                    rate_raw=_pick_number(r.rate, r.top),
                    amount_raw=_pick_number(r.amount, r.top),
                ),
            )
        )

    out.sort(key=lambda pair: pair[0])
    return [ev for _, ev in out]


# ── Cover page ────────────────────────────────────────────────────────────

_DATE_NUMERIC = re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b")
_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_DATE_TEXT = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b")
_STAGE = re.compile(
    r"(\d{2,3})\s*%\s*(schematic(?:\s+design)?|sd|design\s+development|dd|detailed\s+design|concept)"
    r"|(schematic(?:\s+design)?|sd|design\s+development|dd)\s*(\d{2,3})\s*%"
    r"|\b(tender|ifc|issued\s+for\s+construction|concept)\b",
    re.I,
)


def guess_stage(text: str) -> tuple[str | None, str | None]:
    m = _STAGE.search(text)
    if not m:
        return None, None
    raw = m.group(0)
    pct = m.group(1) or m.group(4)
    kind = (m.group(2) or m.group(3) or m.group(5) or "").lower()
    if kind.startswith(("schematic", "sd")):
        return raw, f"SD {pct}%" if pct else "SD 100%"
    if kind.startswith(("design development", "dd", "detailed")):
        return raw, f"DD {pct}%" if pct else "DD 100%"
    if kind == "tender":
        return raw, "Tender"
    if kind in ("ifc",) or kind.startswith("issued"):
        return raw, "IFC / Construction"
    if kind == "concept":
        return raw, "Concept"
    return raw, None


def guess_date(text: str) -> str | None:
    """Day-first dates (GCC convention): 5/10/2026 -> 2026-10-05."""
    m = _DATE_NUMERIC.search(text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    m = _DATE_TEXT.search(text)
    if m and m.group(2)[:3].lower() in _MONTHS:
        return f"{int(m.group(3)):04d}-{_MONTHS[m.group(2)[:3].lower()]:02d}-{int(m.group(1)):02d}"
    return None


def _read_cover(page) -> Cover:
    text = page.extract_text() or ""
    stage_text, stage_guess = guess_stage(text)
    return Cover(boq_date=guess_date(text), stage_text=stage_text, stage_guess=stage_guess)


def inspect_pdf(path: str) -> tuple[Cover, int]:
    """Quick look for the upload form: cover guesses and page count, reading
    only the first few pages."""
    with pdfplumber.open(path) as pdf:
        pages = len(pdf.pages)
        if pages == 0 or sum(len(p.chars) for p in pdf.pages[: min(5, pages)]) < 50:
            raise ExtractError(
                "NO_TEXT",
                "This PDF has no readable text — it looks like a scanned document. Upload the original PDF or Excel BOQ.",
            )
        cover = _read_cover(pdf.pages[0])
        headers: Counter[str] = Counter()
        for page in pdf.pages[1 : min(6, pages)]:
            lines = _group_lines(_words(page))
            cols = _find_columns(lines)
            if cols:
                above = [l for l in lines if l.top < cols.header_bottom - 8]
                if above and not _BILL.search(above[0].text):
                    headers[above[0].text.strip()] += 1
        if headers:
            name, count = headers.most_common(1)[0]
            if count >= 2:
                cover.project_name = name
    return cover, pages
