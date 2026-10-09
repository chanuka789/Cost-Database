from decimal import Decimal

import pytest

from app.hierarchy import BillStart, ItemRow, TextBlock, build
from app.numbers import parse_number, rate_note
from app.text import clean_text, join_lines
from app.units import normalise_unit


@pytest.mark.parametrize(
    "raw,expected",
    [("12,344", Decimal("12344")), ("1,234.50", Decimal("1234.50")), ("(120)", Decimal("-120")), ("-", None), ("", None), ("abc", None)],
)
def test_parse_number(raw, expected):
    assert parse_number(raw) == expected


def test_rate_notes():
    assert rate_note("Incl") == "Included"
    assert rate_note("by others") == "By others"
    assert rate_note("125.00") is None


@pytest.mark.parametrize(
    "raw,expected",
    [("m2", "m²"), ("SQM", "m²"), ("m3", "m³"), ("Nos.", "nr"), ("Item", "item"), ("L.S", "item"), ("Days", "day"), ("kg", "kg"), ("furlong", None)],
)
def test_units(raw, expected):
    assert normalise_unit(raw) == expected


def test_damaged_characters_are_repaired_from_context():
    text, repaired, unreadable = clean_text("Size: 6�8m height; Contractor�s offices")
    assert text == "Size: 6–8m height; Contractor's offices"
    assert repaired and not unreadable


def test_unrepairable_characters_are_reported():
    _, _, unreadable = clean_text("Item �� %")
    assert unreadable


def test_join_lines_keeps_codes_broken_at_a_hyphen():
    assert join_lines(["refer drawing 24-6887-LAN-", "70801 and 70802"]) == "refer drawing 24-6887-LAN-70801 and 70802"
    assert join_lines(["first line", "second line"]) == "first line second line"


def _items(bills):
    return [(s, m, i) for b in bills for s in b.sections for m in s.main_descriptions for i in m.items]


def test_block_rules():
    bills = build(
        [
            BillStart("01", "GENERAL"),
            TextBlock([("Earthworks", True)], 1),
            TextBlock([("Excavation to reduce levels", False)], 1),  # second heading in a row -> child
            ItemRow("A", ["Max depth 500mm"], 1, "10", "m3"),
            TextBlock([("Paving", True), ("Concrete pavers laid on sand bed, all as specified.", False)], 1),
            ItemRow("B", ["Beige"], 1, "5", "m2"),
            ItemRow("C", ["Brown"], 2, "6", "m2"),  # next page, same main description
            TextBlock([("Long paragraph main description that is clearly more than sixty characters long.", False)], 2),
            ItemRow("D", ["Grey"], 2, "7", "m2"),
        ]
    )
    rows = _items(bills)
    s, m, a = rows[0]
    assert (s.parent_heading, s.heading, m.text) == ("Earthworks", "Excavation to reduce levels", "")
    s, m, b = rows[1]
    assert (s.parent_heading, s.heading) == (None, "Paving")
    assert m.text == "Concrete pavers laid on sand bed, all as specified."
    _, m2, c = rows[2]
    assert m2 is m and len(m.items) == 2 and (m.page_from, m.page_to) == (1, 2)
    s, m, d = rows[3]
    assert s.heading == "Paving" and m.text.startswith("Long paragraph")
    # Same heading, new main description: one section holding two main descriptions.
    assert s is rows[1][0] and len(s.main_descriptions) == 2
    assert d.full_description == f"Paving — {m.text} — Grey"


def test_new_bill_resets_heading():
    bills = build(
        [
            BillStart("01", "A"),
            TextBlock([("Paving", True)], 1),
            ItemRow("A", ["x"], 1, "1", "m2"),
            BillStart("02", "B"),
            ItemRow("A", ["y"], 2, "1", "m2"),
        ]
    )
    assert [b.bill_no for b in bills] == ["01", "02"]
    assert bills[1].sections[0].heading is None
