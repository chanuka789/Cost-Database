"""Unit normalisation: the many ways BOQs write a unit -> one standard form.

The original text is always kept as `unit_raw`; `unit` is the standard form,
or None when the unit isn't recognised (the item is then flagged).
"""

import re

_UNITS: dict[str, str] = {}


def _add(standard: str, *spellings: str) -> None:
    for s in (standard, *spellings):
        _UNITS[s] = standard


_add("m²", "m2", "sqm", "sq.m", "sq m", "sq.m.", "m^2", "sm")
_add("m³", "m3", "cum", "cu.m", "cu m", "cu.m.", "m^3", "cm")
_add("m", "lm", "rm", "l.m", "r.m", "lin.m", "linm", "mtr", "mtrs", "metre", "meter", "rmt")
_add("nr", "no", "no.", "nos", "nos.", "number", "each", "ea", "pcs", "pc", "unit", "units", "pair")
_add("item", "lump sum", "ls", "l.s", "l.s.", "sum", "lot", "allow", "ps")
_add("kg", "kgs", "kilogram")
_add("t", "ton", "tons", "tonne", "tonnes", "mt")
_add("day", "days", "dy")
_add("week", "weeks", "wk", "wks")
_add("month", "months", "mth", "mths", "mo")
_add("year", "years", "yr")
_add("hour", "hours", "hr", "hrs")
_add("l", "ltr", "litre", "litres", "liter", "liters")
_add("set", "sets")
_add("point", "points", "pt", "pts")


def normalise_unit(raw: str | None) -> str | None:
    if not raw:
        return None
    key = re.sub(r"\s+", " ", raw.strip().lower()).rstrip(".")
    key = key.replace("²", "2").replace("³", "3")
    return _UNITS.get(key) or _UNITS.get(key + ".")
