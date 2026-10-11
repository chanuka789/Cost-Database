"""Entry point: file on disk -> ExtractResult."""

from .hierarchy import TotalRow, build
from .models import ExtractResult, Issue, Quality, Stats
from .pdf_reader import ExtractError, read_pdf
from .validate import assess, check_items, check_page_totals, check_run_totals

VERSION = "1.1.0"


def extract(path: str, file_type: str, column_mapping: dict | None = None, layout: dict | None = None) -> ExtractResult:
    """layout = the AI layout plan (see layout.py); without it the rule-based readers are used."""
    if file_type not in ("pdf", "xlsx"):
        raise ExtractError("UNSUPPORTED", "Only PDF and Excel (.xlsx) BOQs are supported.")
    if layout is not None:
        from .layout import read_with_layout

        read = read_with_layout(path, file_type, column_mapping, layout)
        parser = "ai-layout"
    elif file_type == "pdf":
        read = read_pdf(path)
        parser = "pdf-columns"
    else:
        from .excel_reader import read_excel

        read = read_excel(path, column_mapping)
        parser = "xlsx-columns"

    bills = build(read.events)
    check_items(bills, check_page_refs=file_type == "pdf" and layout is None)
    issues: list[Issue] = [*read.issues, *check_page_totals(bills, read.page_totals), *check_run_totals(read.events)]

    items = [i for b in bills for s in b.sections for m in s.main_descriptions for i in m.items]
    if not items:
        raise ExtractError(
            "NO_ITEMS",
            "No BOQ items were found. The file may use a layout the extractor doesn't know yet — upload it with AI switched on, or send it to the admin team to add support.",
        )
    return ExtractResult(
        parser=parser,
        version=VERSION,
        file_type=file_type,  # type: ignore[arg-type]
        cover=read.cover,
        bills=bills,
        page_totals=read.page_totals,
        issues=issues,
        stats=Stats(items=len(items), priced_items=sum(1 for i in items if i.rate is not None), bills=len(bills), pages=read.pages),
        quality=assess(bills, issues, _totals_checked(read)) if layout is None else Quality(),
    )


def _totals_checked(read) -> int:
    return sum(1 for e in read.events if isinstance(e, TotalRow)) + sum(1 for t in read.page_totals if t.amount is not None)
