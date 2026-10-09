"""Text clean-up for descriptions."""

import re

REPLACEMENT = "�"

# Some PDFs map dashes and apostrophes to the Unicode replacement character
# (the information is lost in the file itself). It can be repaired from
# context: between digits it's a range dash, inside a word it's an apostrophe.
_RANGE = re.compile(rf"(\d)\s?{REPLACEMENT}\s?(\d)")
_APOSTROPHE = re.compile(rf"([A-Za-z]){REPLACEMENT}([A-Za-z])")


def clean_text(text: str) -> tuple[str, bool, bool]:
    """Returns (clean text, was anything repaired, is anything still unreadable)."""
    original = text
    text = _RANGE.sub(r"\1–\2", text)
    text = _APOSTROPHE.sub(r"\1'\2", text)
    text = text.replace("’", "'").replace("‘", "'")
    text = re.sub(r"[ \t ]+", " ", text).strip()
    repaired = text != re.sub(r"[ \t ]+", " ", original).strip()
    return text, repaired, REPLACEMENT in text


def join_lines(lines: list[str]) -> str:
    """Joins wrapped lines. A line ending in a hyphen joins without a space and
    keeps the hyphen, since in BOQs that's almost always a code broken across
    lines ("…DWG-LAN-" + "70801"), not a hyphenated word."""
    out = ""
    for line in (l.strip() for l in lines):
        if not line:
            continue
        if not out:
            out = line
        elif out.endswith("-") and not out.endswith(" -"):
            out = out + line
        else:
            out = f"{out} {line}"
    return out
