"""QSGS Cost Database — BOQ extractor service.

Runs on Railway's private network; only the web app calls it. Every endpoint
except /health also requires the shared token in the X-Extractor-Token header,
so it stays closed even if it is ever exposed by mistake.

Phase 0: service skeleton. BOQ parsing arrives in Phase 2 (see
docs/BUILD_PLAN.md section 5; the tested prototype is in prototype/).
"""

import hmac
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="QSGS BOQ Extractor", version="0.1.0", docs_url=None, redoc_url=None)

OPEN_PATHS = {"/health"}


@app.middleware("http")
async def require_token(request: Request, call_next):
    if request.url.path in OPEN_PATHS:
        return await call_next(request)
    expected = os.environ.get("EXTRACTOR_TOKEN", "")
    given = request.headers.get("x-extractor-token", "")
    # Refuse everything when no token is configured, rather than running open.
    if not expected or not hmac.compare_digest(expected, given):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok", "service": "extractor", "version": app.version}


@app.get("/v1/info")
def info():
    """Authenticated check used by the web app to confirm it can reach the extractor."""
    return {"formats": ["pdf", "xlsx"], "phase": 0}
