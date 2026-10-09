"""Automatic checks on an extraction (docs/BUILD_PLAN.md section 5.2).

Item problems are added to the item's flags; document problems (page totals)
are returned as issues. Errors must be fixed or accepted in review before a
BOQ can be published.
"""

from decimal import Decimal

from .hierarchy import amount_matches
from .models import Bill, Flag, Issue, Item, PageTotal

# BOQs skip I and O so they aren't read as 1 and 0.
_LETTERS = [c for c in "ABCDEFGHJKLMNPQRSTUVWXYZ"]


def _flag(item: Item, code: str, severity: str, message: str) -> None:
    if not any(f.code == code for f in item.flags):
        item.flags.append(Flag(code=code, severity=severity, message=message))  # type: ignore[arg-type]


def check_items(bills: list[Bill], *, check_page_refs: bool = True) -> None:
    for bill in bills:
        seen_on_page: dict[tuple[int, str], int] = {}
        previous: Item | None = None
        for section in bill.sections:
            for md in section.main_descriptions:
                for item in md.items:
                    _check_item(item)
                    # Excel records a sheet number, not a printed page. Refs
                    # legitimately restart throughout a bill sheet, so PDF's
                    # per-page duplicate/sequence checks don't apply there.
                    if not check_page_refs:
                        continue
                    key = (item.page, item.ref.upper())
                    seen_on_page[key] = seen_on_page.get(key, 0) + 1
                    if seen_on_page[key] > 1:
                        _flag(item, "DUPLICATE_REF", "warning", f"Item {item.ref} appears more than once on page {item.page}.")
                    if previous is not None and previous.page == item.page:
                        _check_sequence(previous, item)
                    previous = item


def _check_item(item: Item) -> None:
    if not item.description.strip():
        _flag(item, "EMPTY_DESCRIPTION", "error", "This item has no description.")
    if item.qty is None and item.rate_note is None:
        _flag(item, "MISSING_QTY", "warning", "No quantity found.")
    if item.unit_raw is None:
        _flag(item, "MISSING_UNIT", "warning", "No unit found.")
    elif item.unit is None:
        _flag(item, "UNKNOWN_UNIT", "warning", f'Unit "{item.unit_raw}" isn\'t a standard unit. Check it.')
    if item.qty is not None and item.rate is not None and item.amount is not None:
        if not amount_matches(Decimal(item.qty), Decimal(item.rate), Decimal(item.amount)):
            _flag(
                item,
                "AMOUNT_MISMATCH",
                "error",
                f"Quantity × rate ({Decimal(item.qty) * Decimal(item.rate):,.2f}) doesn't match the amount ({Decimal(item.amount):,.2f}).",
            )
    elif item.rate is not None and item.amount is None:
        _flag(item, "AMOUNT_MISSING", "warning", "Has a rate but no amount.")
    elif item.amount is not None and item.rate is None:
        _flag(item, "RATE_MISSING", "warning", "Has an amount but no rate.")


def _check_sequence(prev: Item, item: Item) -> None:
    a, b = prev.ref.upper(), item.ref.upper()
    if a in _LETTERS and b in _LETTERS:
        gap = _LETTERS.index(b) - _LETTERS.index(a)
        if gap > 1:
            missing = ", ".join(_LETTERS[_LETTERS.index(a) + 1 : _LETTERS.index(b)])
            _flag(item, "REF_GAP", "warning", f"Item {missing} seems to be missing before {item.ref} on page {item.page}.")
        elif gap <= 0 and b != "A":
            _flag(item, "REF_ORDER", "warning", f"Item {item.ref} comes after {prev.ref} on page {item.page}.")


def check_page_totals(bills: list[Bill], totals: list[PageTotal]) -> list[Issue]:
    """Sum of item amounts on each page must equal the page's carried-to-collection total."""
    issues: list[Issue] = []
    by_page: dict[int, Decimal] = {}
    for bill in bills:
        for section in bill.sections:
            for md in section.main_descriptions:
                for item in md.items:
                    if item.amount is not None:
                        by_page[item.page] = by_page.get(item.page, Decimal(0)) + Decimal(item.amount)
    for t in totals:
        if t.amount is None:
            continue
        found = by_page.get(t.page, Decimal(0))
        if abs(found - Decimal(t.amount)) > Decimal("1"):
            issues.append(
                Issue(
                    code="PAGE_TOTAL_MISMATCH",
                    severity="error",
                    message=f"Page {t.page}: items add up to {found:,.2f} but the page total is {Decimal(t.amount):,.2f}. An item may be missing or misread.",
                    page=t.page,
                )
            )
    return issues
