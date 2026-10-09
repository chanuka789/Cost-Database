from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

from .synthetic_boq import Page, Row, draw

client = TestClient(app)
TOKEN = {"x-extractor-token": "secret-for-tests"}


@pytest.fixture(autouse=True)
def token(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_TOKEN", "secret-for-tests")


def test_health_is_open():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_other_endpoints_need_the_token():
    assert client.get("/v1/info").status_code == 401
    assert client.get("/v1/info", headers={"x-extractor-token": "wrong"}).status_code == 401
    assert client.get("/v1/info", headers=TOKEN).status_code == 200


def test_refuses_everything_when_no_token_is_configured(monkeypatch):
    monkeypatch.delenv("EXTRACTOR_TOKEN", raising=False)
    assert client.get("/v1/info", headers={"x-extractor-token": ""}).status_code == 401


def _pdf(tmp_path: Path) -> bytes:
    path = tmp_path / "b.pdf"
    draw(
        str(path),
        cover=["TEST PROJECT", "SD 100%", "1/9/2026"],
        pages=[Page(bill="BILL NO. 01 - GENERAL", rows=[Row("heading", ["Paving"]), Row("item", ["Pavers"], ref="A", qty="10", unit="m2")])] * 2,
    )
    return path.read_bytes()


def test_extract_endpoint(tmp_path):
    r = client.post("/v1/extract", headers=TOKEN, files={"file": ("boq.pdf", _pdf(tmp_path), "application/pdf")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["stats"]["items"] == 2
    assert body["bills"][0]["sections"][0]["main_descriptions"][0]["items"][0]["qty"] == "10"


def test_inspect_endpoint(tmp_path):
    r = client.post("/v1/inspect", headers=TOKEN, files={"file": ("boq.pdf", _pdf(tmp_path), "application/pdf")})
    assert r.status_code == 200, r.text
    assert r.json()["cover"] == {
        "project_name": "TEST PROJECT",
        "boq_date": "2026-09-01",
        "stage_text": "SD 100%",
        "stage_guess": "SD 100%",
    }


def test_rejects_unsupported_files():
    r = client.post("/v1/extract", headers=TOKEN, files={"file": ("old.xls", b"x", "application/vnd.ms-excel")})
    assert r.status_code == 422
    assert r.json()["code"] == "UNSUPPORTED"
    assert "xlsx" in r.json()["message"]
