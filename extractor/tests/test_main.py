from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_is_open():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_other_endpoints_need_the_token(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_TOKEN", "secret-for-tests")
    assert client.get("/v1/info").status_code == 401
    assert client.get("/v1/info", headers={"x-extractor-token": "wrong"}).status_code == 401
    r = client.get("/v1/info", headers={"x-extractor-token": "secret-for-tests"})
    assert r.status_code == 200


def test_refuses_everything_when_no_token_is_configured(monkeypatch):
    monkeypatch.delenv("EXTRACTOR_TOKEN", raising=False)
    assert client.get("/v1/info", headers={"x-extractor-token": ""}).status_code == 401
