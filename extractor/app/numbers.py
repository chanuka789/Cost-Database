"""Reading quantities, rates and amounts as written in BOQs."""

import re
from decimal import Decimal, InvalidOperation

# Words contractors and QSs write instead of a number.
RATE_NOTES = {
    "incl": "Included",
    "incl.": "Included",
    "included": "Included",
    "inc": "Included",
    "excl": "Excluded",
    "excl.": "Excluded",
    "excluded": "Excluded",
    "n/a": "Not applicable",
    "na": "Not applicable",
    "nil": "Nil",
    "by others": "By others",
    "provisional": "Provisional",
    "rate only": "Rate only",
}

_NUMBER = re.compile(r"^\(?-?[\d,]*\.?\d+\)?$")


def parse_number(raw: str | None) -> Decimal | None:
    """'12,344' -> 12344, '1,234.50' -> 1234.50, '(120)' -> -120, '-' or '' -> None."""
    if raw is None:
        return None
    s = raw.strip().replace(" ", "").replace(" ", "")
    if s in ("", "-", "–", "—", "--"):
        return None
    if not _NUMBER.match(s):
        return None
    negative = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "")
    try:
        value = Decimal(s)
    except InvalidOperation:
        return None
    return -value if negative else value


def is_number_token(raw: str) -> bool:
    s = raw.strip().replace(",", "")
    return bool(s) and (parse_number(raw) is not None or s in ("-", "–", "—"))


def rate_note(raw: str | None) -> str | None:
    """'Incl', 'by others', … -> a standard note; None if it's not one."""
    if not raw:
        return None
    return RATE_NOTES.get(raw.strip().lower())


def decimal_str(value: Decimal | None) -> str | None:
    """Decimals travel as strings so no precision is lost on the way to the database."""
    if value is None:
        return None
    text = format(value.normalize(), "f")
    return text
