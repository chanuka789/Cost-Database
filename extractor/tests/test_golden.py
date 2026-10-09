"""Golden-file tests: every real BOQ layout we support must extract exactly as
its checked reference result.

The BOQs are client documents, so they live in tests/fixtures/private/
(git-ignored) next to `<name>.expected.json`. These tests run wherever those
files exist (the QSGS machines) and are skipped elsewhere.

After a deliberate parser improvement, re-check the differences by hand and
regenerate a reference with:  python -m tests.test_golden --update <name>.pdf
"""

import json
import sys
from pathlib import Path

import pytest

from app.extract import extract

PRIVATE = Path(__file__).parent / "fixtures" / "private"
CASES = sorted(PRIVATE.glob("*.pdf")) if PRIVATE.exists() else []


def _normalise(data: dict) -> dict:
    data = dict(data)
    data.pop("version", None)
    return data


@pytest.mark.skipif(not CASES, reason="no private golden BOQs on this machine")
@pytest.mark.parametrize("pdf", CASES, ids=[c.name for c in CASES])
def test_matches_reference(pdf: Path):
    expected_file = pdf.with_suffix(".expected.json")
    assert expected_file.exists(), f"missing {expected_file.name}"
    expected = _normalise(json.loads(expected_file.read_text(encoding="utf-8")))
    actual = _normalise(json.loads(extract(str(pdf), "pdf").model_dump_json()))
    assert actual["stats"] == expected["stats"]
    for got, want in zip(actual["bills"], expected["bills"], strict=True):
        assert got == want, f"bill {want['bill_no']} differs"
    assert actual == expected


if __name__ == "__main__" and len(sys.argv) == 3 and sys.argv[1] == "--update":
    pdf = PRIVATE / sys.argv[2]
    pdf.with_suffix(".expected.json").write_text(extract(str(pdf), "pdf").model_dump_json(indent=1), encoding="utf-8")
    print(f"updated {pdf.with_suffix('.expected.json').name}")
