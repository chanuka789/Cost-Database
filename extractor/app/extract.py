"""Entry point: file on disk -> ExtractResult."""

from .hierarchy import build
from .models import ExtractResult, Issue, Stats
from .pdf_reader import ExtractError, read_pdf
from .validate import check_items, check_page_totals

VERSION = "1.0.0"


def extract(path: str, file_type: str) -> ExtractResult:
    if file_type == "pdf":
        read = read_pdf(path)
        parser = "pdf-columns"
    elif file_type == "xlsx":
        from .excel_reader import read_excel

        read = read_excel(path)
        parser = "xlsx-columns"
    else:
        raise ExtractError("UNSUPPORTED", "Only PDF and Excel (.xlsx) BOQs are supported.")

    bills = build(read.events)
    check_items(bills)
    issues: list[Issue] = [*read.issues, *check_page_totals(bills, read.page_totals)]

    items = [i for b in bills for s in b.sections for m in s.main_descriptions for i in m.items]
    if not items:
        raise ExtractError(
            "NO_ITEMS",
            "No BOQ items were found. The file may use a layout the extractor doesn't know yet — send it to the admin team to add support.",
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
    )
