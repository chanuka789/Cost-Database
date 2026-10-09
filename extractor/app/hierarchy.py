"""Builds Bill › Heading › Main description › Item from a stream of events.

Both readers (PDF and Excel) turn a BOQ into the same three kinds of event,
in reading order:

- BillStart   — a new bill begins ("BILL NO. 02 - HARDSCAPING WORKS")
- TextBlock   — lines of text that are not an item, separated from other
                text by a gap (a heading, a main description, notes)
- ItemRow     — one measured item: its reference, description and numbers

How a text block is read:
- one short line (or one bold line)          -> heading
- bold first line followed by regular lines  -> heading + main description
- anything else (a paragraph)                -> main description
- two headings in a row                      -> the first becomes the parent
  heading of the second ("Hard Landscaping › Sub-Grade")

A heading or main description applies to every item after it — across
pages — until a new one replaces it. One main description can therefore
cover any number of items.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from .models import Bill, Flag, Item, MainDescription, Section
from .numbers import decimal_str, parse_number, rate_note
from .text import clean_text, join_lines
from .units import normalise_unit

HEADING_MAX_CHARS = 60
_DITTO_PREFIXES = ("ditto", "as above", "as item", "a.b.", "ditto but", "as before")


@dataclass
class BillStart:
    bill_no: str
    title: str


@dataclass
class TextBlock:
    lines: list[tuple[str, bool]]  # (text, is_bold)
    page: int


@dataclass
class ItemRow:
    ref: str
    lines: list[str]
    page: int
    qty_raw: str | None = None
    unit_raw: str | None = None
    rate_raw: str | None = None
    amount_raw: str | None = None


Event = BillStart | TextBlock | ItemRow


@dataclass
class _State:
    bills: list[Bill] = field(default_factory=list)
    parent: str | None = None
    heading: str | None = None
    main: str = ""
    last_block_was_heading: bool = False
    previous_item: Item | None = None
    section: Section | None = None
    main_desc: MainDescription | None = None


def _clean(text: str, flags: list[Flag]) -> str:
    out, repaired, unreadable = clean_text(text)
    if repaired and not any(f.code == "TEXT_REPAIRED" for f in flags):
        flags.append(Flag(code="TEXT_REPAIRED", severity="info", message="Dashes or apostrophes were restored from damaged PDF text."))
    if unreadable and not any(f.code == "UNREADABLE_TEXT" for f in flags):
        flags.append(Flag(code="UNREADABLE_TEXT", severity="warning", message="Some characters couldn't be read from the PDF. Check the description."))
    return out


def _read_block(block: TextBlock) -> tuple[str | None, str | None]:
    """Returns (heading, main description) for a text block; either may be None."""
    lines = [(t.strip(), b) for t, b in block.lines if t.strip()]
    if not lines:
        return None, None
    if len(lines) == 1:
        text, bold = lines[0]
        if bold or len(text) < HEADING_MAX_CHARS:
            return text, None
        return None, text
    if lines[0][1] and not lines[1][1]:
        return lines[0][0], join_lines([t for t, _ in lines[1:]])
    return None, join_lines([t for t, _ in lines])


def build(events: list[Event]) -> list[Bill]:
    st = _State()

    def current_bill() -> Bill:
        if not st.bills:
            st.bills.append(Bill(bill_no="1", title="Bill of Quantities"))
        return st.bills[-1]

    def reset_scope() -> None:
        st.parent = st.heading = None
        st.main = ""
        st.last_block_was_heading = False
        st.section = st.main_desc = None
        st.previous_item = None

    for ev in events:
        if isinstance(ev, BillStart):
            if not st.bills or st.bills[-1].bill_no != ev.bill_no:
                st.bills.append(Bill(bill_no=ev.bill_no, title=ev.title))
                reset_scope()
            continue

        if isinstance(ev, TextBlock):
            heading, main = _read_block(ev)
            scratch: list[Flag] = []
            if heading:
                heading = _clean(heading, scratch)
                # Two headings in a row: the first is the parent of the second.
                # Otherwise the parent is cleared — guessing it would sometimes
                # attach a section to the wrong group, and wrong is worse than missing.
                st.parent = st.heading if st.last_block_was_heading else None
                st.heading = heading
                st.main = _clean(main, scratch) if main else ""
                st.last_block_was_heading = main is None
                st.section = st.main_desc = None  # new heading: new section
            elif main:
                st.main = _clean(main, scratch)
                st.last_block_was_heading = False
                st.main_desc = None  # same heading, next main description
            continue

        # ItemRow
        bill = current_bill()
        flags: list[Flag] = []
        description = _clean(join_lines(ev.lines), flags)
        st.last_block_was_heading = False

        if st.section is None:
            st.section = Section(parent_heading=st.parent, heading=st.heading)
            bill.sections.append(st.section)
        if st.main_desc is None:
            st.main_desc = MainDescription(text=st.main, page_from=ev.page, page_to=ev.page)
            st.section.main_descriptions.append(st.main_desc)
        st.main_desc.page_to = ev.page

        base = description
        if description.lower().startswith(_DITTO_PREFIXES) and st.previous_item is not None:
            base = f"{st.previous_item.description}; {description}"
            flags.append(Flag(code="DITTO", severity="info", message="Description continues the previous item (ditto)."))

        parts = [p for p in (st.heading, st.main, base) if p]
        full = " — ".join(parts)

        qty = parse_number(ev.qty_raw)
        rate = parse_number(ev.rate_raw)
        amount = parse_number(ev.amount_raw)
        unit_raw = (ev.unit_raw or "").strip() or None
        item = Item(
            ref=ev.ref.strip(),
            description=description,
            full_description=full,
            unit_raw=unit_raw,
            unit=normalise_unit(unit_raw),
            qty=decimal_str(qty),
            rate=decimal_str(rate),
            amount=decimal_str(amount),
            rate_note=rate_note(ev.rate_raw) or rate_note(ev.amount_raw),
            page=ev.page,
            flags=flags,
        )
        st.main_desc.items.append(item)
        st.previous_item = item

    return st.bills


def amount_matches(qty: Decimal, rate: Decimal, amount: Decimal) -> bool:
    expected = qty * rate
    tolerance = max(Decimal("1"), abs(expected) * Decimal("0.01"))
    return abs(expected - amount) <= tolerance
