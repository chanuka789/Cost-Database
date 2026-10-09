from pathlib import Path

import pytest

from app.extract import extract
from app.pdf_reader import ExtractError, guess_date, guess_stage

from .synthetic_boq import Page, Row, draw


def items_of(result):
    return [(b, s, m, i) for b in result.bills for s in b.sections for m in s.main_descriptions for i in m.items]


@pytest.fixture
def boq(tmp_path: Path):
    path = tmp_path / "boq.pdf"
    draw(
        str(path),
        cover=["TEST PROJECT", "50% Schematic design", "5/10/2026", "BILLS OF QUANTITIES"],
        pages=[
            Page(
                bill="BILL NO. 01 - HARDSCAPING WORKS",
                rows=[
                    Row("heading", ["Paving"]),
                    Row(
                        "text",
                        [
                            "60mm thick concrete paver blocks laid on a 50mm thick",
                            "sharp sand bed, in accordance with the Drawings and",
                            "Specifications.",
                        ],
                    ),
                    # Reference on the first line, quantity centred lower down.
                    Row("item", ["Concrete paver, beige, size 300x300x60mm;", "Ref: P1"], ref="A", qty="120", unit="m2", ref_at="top"),
                    # Reference centred between two description lines.
                    Row("item", ["Concrete paver, brown, size 300x300x60mm;", "Ref: P2"], ref="B", qty="1,678", unit="m2", ref_at="middle"),
                    # Reference and quantity above the description.
                    Row("item", ["Concrete paver, orange, size 400x400x60mm;", "Ref: P5"], ref="C", qty="2,408", unit="m2", ref_at="above"),
                    Row("heading", ["Kerbs"]),
                    Row("item", ["Flush kerb 915x150x250mm high"], ref="D", qty="1,002", unit="m"),
                ],
            ),
            Page(
                bill="BILL NO. 01 - HARDSCAPING WORKS",
                rows=[
                    # No new heading: still under "Kerbs".
                    Row("item", ["Drop kerb 915x150x250mm high"], ref="A", qty="40", unit="m"),
                    Row("item", ["Ditto but 300mm high"], ref="B", qty="12", unit="m"),
                ],
            ),
        ],
    )
    return path


def test_reads_every_item_with_its_hierarchy(boq):
    result = extract(str(boq), "pdf")
    rows = items_of(result)
    assert [i.ref for *_, i in rows] == ["A", "B", "C", "D", "A", "B"]
    assert result.stats.items == 6
    assert [b.bill_no for b in result.bills] == ["01"]
    assert result.bills[0].title == "HARDSCAPING WORKS"

    _, paving, main, a = rows[0]
    assert paving.heading == "Paving"
    assert main.text.startswith("60mm thick concrete paver blocks")
    assert a.description == "Concrete paver, beige, size 300x300x60mm; Ref: P1"
    assert a.full_description.startswith("Paving — 60mm thick concrete paver")


def test_one_main_description_covers_several_items(boq):
    rows = items_of(extract(str(boq), "pdf"))
    mains = {id(m) for _, _, m, i in rows if i.ref in ("A", "B", "C") and i.page == 2}
    assert len(mains) == 1
    first_three = [m for *_, m, i in [(b, s, m, i) for b, s, m, i in rows][:3]]
    assert len(first_three[0].items) == 3


@pytest.mark.parametrize("ref,text", [("A", "Ref: P1"), ("B", "Ref: P2"), ("C", "Ref: P5")])
def test_all_three_row_layouts_keep_whole_description(boq, ref, text):
    item = next(i for *_, i in items_of(extract(str(boq), "pdf")) if i.ref == ref and i.page == 2)
    assert item.description.endswith(text)
    assert not any(f.code == "EMPTY_DESCRIPTION" for f in item.flags)


def test_numbers_and_units(boq):
    rows = {(i.page, i.ref): i for *_, i in items_of(extract(str(boq), "pdf"))}
    assert rows[(2, "B")].qty == "1678"
    assert rows[(2, "B")].unit_raw == "m2" and rows[(2, "B")].unit == "m²"
    assert rows[(2, "D")].unit == "m"


def test_heading_carries_to_next_page_and_ditto_expands(boq):
    rows = items_of(extract(str(boq), "pdf"))
    _, section, _, drop = next(r for r in rows if r[3].page == 3 and r[3].ref == "A")
    assert section.heading == "Kerbs"
    ditto = next(i for *_, i in rows if i.page == 3 and i.ref == "B")
    assert any(f.code == "DITTO" for f in ditto.flags)
    assert "Drop kerb 915x150x250mm high; Ditto but 300mm high" in ditto.full_description


def test_footer_and_page_numbers_are_not_items_or_headings(boq):
    result = extract(str(boq), "pdf")
    headings = {s.heading for b in result.bills for s in b.sections}
    assert not any(h and ("B1/" in h or "CARRIED" in h) for h in headings)
    assert [t.page for t in result.page_totals] == [2, 3]


def test_cover_guesses(boq):
    cover = extract(str(boq), "pdf").cover
    assert cover.project_name == "TEST PROJECT"
    assert cover.boq_date == "2026-10-05"
    assert cover.stage_guess == "SD 50%"


def test_priced_items_are_checked(tmp_path):
    path = tmp_path / "priced.pdf"
    draw(
        str(path),
        pages=[
            Page(
                bill="BILL NO. 02 - CONCRETE",
                footer_total="1,000.00",
                rows=[
                    Row("heading", ["Concrete"]),
                    Row("item", ["C25 concrete in ground beams"], ref="A", qty="10", unit="m3", rate="100.00", amount="1,000.00"),
                    Row("item", ["C25 concrete in slabs"], ref="B", qty="10", unit="m3", rate="100.00", amount="900.00"),
                ],
            )
        ],
    )
    result = extract(str(path), "pdf")
    a, b = [i for *_, i in items_of(result)]
    assert a.rate == "100" and a.amount == "1000" and not a.flags
    assert any(f.code == "AMOUNT_MISMATCH" and f.severity == "error" for f in b.flags)
    assert any(i.code == "PAGE_TOTAL_MISMATCH" for i in result.issues)


def test_scanned_pdf_is_rejected_with_a_clear_message(tmp_path):
    from reportlab.pdfgen import canvas

    path = tmp_path / "scan.pdf"
    c = canvas.Canvas(str(path))
    c.rect(50, 50, 400, 600, fill=1)
    c.showPage()
    c.save()
    with pytest.raises(ExtractError) as err:
        extract(str(path), "pdf")
    assert err.value.code == "NO_TEXT"


@pytest.mark.parametrize(
    "text,expected",
    [("Issued 5/10/2026", "2026-10-05"), ("Date: 21.03.2025", "2025-03-21"), ("12 October 2026", "2026-10-12"), ("no date", None)],
)
def test_guess_date(text, expected):
    assert guess_date(text) == expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("50% Schematic design", "SD 50%"),
        ("SD 100%", "SD 100%"),
        ("Design Development 50%", "DD 50%"),
        ("Tender Documents", "Tender"),
        ("Bills of Quantities", None),
    ],
)
def test_guess_stage(text, expected):
    assert guess_stage(text)[1] == expected
