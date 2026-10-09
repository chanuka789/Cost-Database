"""Output of an extraction — the contract between the extractor and the web app.

Quantities, rates and amounts are decimal strings, so no precision is lost.
Changing this shape means updating web/src/lib/extraction-schema.ts too.
"""

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["error", "warning", "info"]


class Flag(BaseModel):
    code: str
    severity: Severity
    message: str


class Item(BaseModel):
    ref: str
    description: str
    full_description: str
    unit_raw: str | None = None
    unit: str | None = None
    qty: str | None = None
    rate: str | None = None
    amount: str | None = None
    rate_note: str | None = None
    page: int
    flags: list[Flag] = Field(default_factory=list)


class MainDescription(BaseModel):
    """The paragraph above a group of items. Empty text = items with no paragraph."""

    text: str
    page_from: int
    page_to: int
    items: list[Item] = Field(default_factory=list)


class Section(BaseModel):
    parent_heading: str | None = None
    heading: str | None = None
    main_descriptions: list[MainDescription] = Field(default_factory=list)


class Bill(BaseModel):
    bill_no: str
    title: str
    sections: list[Section] = Field(default_factory=list)


class Cover(BaseModel):
    project_name: str | None = None
    boq_date: str | None = None  # ISO yyyy-mm-dd
    stage_text: str | None = None
    stage_guess: str | None = None  # matches a stage name in the app's list, e.g. "SD 50%"


class PageTotal(BaseModel):
    page: int
    bill_no: str | None
    amount: str | None


class Issue(BaseModel):
    code: str
    severity: Severity
    message: str
    page: int | None = None


class Stats(BaseModel):
    items: int
    priced_items: int
    bills: int
    pages: int


class ExtractResult(BaseModel):
    parser: str
    version: str
    file_type: Literal["pdf", "xlsx"]
    cover: Cover
    bills: list[Bill]
    page_totals: list[PageTotal] = Field(default_factory=list)
    issues: list[Issue] = Field(default_factory=list)
    stats: Stats
