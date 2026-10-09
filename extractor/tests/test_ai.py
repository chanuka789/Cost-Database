import asyncio
import base64
import json
import os
import subprocess
from pathlib import Path

import httpx
import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient

from app.ai import AiRequest, complete, decrypt_key, endpoint
from app.main import app


def credential(monkeypatch):
    key, nonce = b"a" * 32, b"b" * 12
    monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", base64.b64encode(key).decode())
    cipher = AESGCM(key).encrypt(nonce, b"synthetic-test-key", b"qsgs-ai-key-v1")
    return ":".join(["v1", *[base64.b64encode(v).decode() for v in [nonce, cipher[:-16], cipher[-16:]]]])


def test_node_python_key_interoperability(monkeypatch):
    encoded = base64.b64encode(b"a" * 32).decode()
    monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", encoded)
    script = 'const c=require("node:crypto"); const n=Buffer.alloc(12,98);const e=c.createCipheriv("aes-256-gcm",Buffer.alloc(32,97),n);e.setAAD(Buffer.from("qsgs-ai-key-v1"));const b=Buffer.concat([e.update("synthetic-test-key"),e.final()]);console.log(["v1",n.toString("base64"),b.toString("base64"),e.getAuthTag().toString("base64")].join(":"));'
    value = subprocess.check_output(["node", "-e", script], text=True).strip()
    assert decrypt_key(value) == "synthetic-test-key"
    with pytest.raises(Exception):
        decrypt_key(value[:-4] + "AAAA")


def test_public_endpoint_only_and_ip_pinning(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [(None, None, None, None, ("8.8.8.8", 443))])
    assert endpoint("https://example.com/v1") == ("https://8.8.8.8/v1/chat/completions", "example.com")
    for url in ["http://example.com", "https://user:password@example.com", "https://example.com:8100", "https://example.com/v1?key=secret"]:
        with pytest.raises(ValueError): endpoint(url)
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [(None, None, None, None, ("127.0.0.1", 443))])
    with pytest.raises(ValueError): endpoint("https://example.com/v1")


def test_strict_json_and_metering(monkeypatch):
    encrypted = credential(monkeypatch)
    request = AiRequest(base_url="https://example.com/v1", model="model", encrypted_key=encrypted, prompt='Return {"ok":true}.')
    def handle(r):
        assert r.headers["authorization"] == "Bearer synthetic-test-key"
        assert r.headers["host"] == "example.com"
        assert r.extensions["sni_hostname"] == "example.com"
        body = json.loads(r.content)
        assert body["response_format"] == {"type": "json_object"}
        assert body["max_tokens"] == 2048
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok":true}'}}], "usage": {"prompt_tokens": 12, "completion_tokens": 4}})
    result = asyncio.run(complete(request, transport=httpx.MockTransport(handle), resolved=("https://8.8.8.8/v1/chat/completions", "example.com")))
    assert result["ok"] and result["metered"] and result["data"] == {"ok": True}
    assert result["input_tokens"] == 12 and result["output_tokens"] == 4
    bad = httpx.MockTransport(lambda r: httpx.Response(200, json={"choices": [{"message": {"content": '```json\n{"ok":true}\n```'}}], "usage": {"prompt_tokens": 12, "completion_tokens": 4}}))
    result = asyncio.run(complete(request, transport=bad, resolved=("https://8.8.8.8/v1/chat/completions", "example.com")))
    assert not result["ok"] and result["metered"]


def test_failure_does_not_echo_secrets(monkeypatch):
    encrypted = credential(monkeypatch)
    request = AiRequest(base_url="https://example.com/v1", model="model", encrypted_key=encrypted, prompt="test")
    transport = httpx.MockTransport(lambda r: httpx.Response(401, text="synthetic-test-key"))
    result = asyncio.run(complete(request, transport=transport, resolved=("https://8.8.8.8/v1/chat/completions", "example.com")))
    assert result["code"] == "HTTP_401" and "synthetic-test-key" not in json.dumps(result)


def test_ai_endpoint_requires_extractor_token(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_TOKEN", "test-token")
    response = TestClient(app).post("/v1/ai/complete", json={})
    assert response.status_code == 401
