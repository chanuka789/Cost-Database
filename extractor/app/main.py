"""QSGS Cost Database — BOQ extractor service.

Runs on Railway's private network; only the web app calls it. Every endpoint
except /health also requires the shared token in the X-Extractor-Token header,
so it stays closed even if it is ever exposed by mistake.

Endpoints:
  GET  /health       — liveness, no token
  GET  /v1/info      — token check and supported formats
  POST /v1/inspect   — cover guesses (project, date, stage) for the upload form
  POST /v1/extract   — full extraction: Bill › Heading › Main description › Item
"""

import hmac
import logging
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse

from .extract import VERSION, extract
from .models import Cover
from .pdf_reader import ExtractError, inspect_pdf

log = logging.getLogger("extractor")
app = FastAPI(title="QSGS BOQ Extractor", version=VERSION, docs_url=None, redoc_url=None, openapi_url=None)

OPEN_PATHS = {"/health"}
MAX_BYTES = 50 * 1024 * 1024
TYPES = {".pdf": "pdf", ".xlsx": "xlsx"}


@app.middleware("http")
async def require_token(request: Request, call_next):
    if request.url.path in OPEN_PATHS:
        return await call_next(request)
    expected = os.environ.get("EXTRACTOR_TOKEN", "")
    given = request.headers.get("x-extractor-token", "")
    # Refuse everything when no token is configured, rather than running open.
    if not expected or not hmac.compare_digest(expected, given):
        return JSONResponse({"code": "UNAUTHORIZED", "message": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.exception_handler(ExtractError)
async def extract_error(_: Request, exc: ExtractError):
    return JSONResponse({"code": exc.code, "message": exc.message}, status_code=422)


@app.get("/health")
def health():
    return {"status": "ok", "service": "extractor", "version": VERSION}


@app.get("/v1/info")
def info():
    return {"formats": list(TYPES.values()), "version": VERSION, "max_mb": MAX_BYTES // (1024 * 1024)}


def _save_upload(file: UploadFile) -> tuple[Path, str]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix == ".xls":
        raise ExtractError("UNSUPPORTED", "Old .xls files aren't supported. Open it in Excel and save as .xlsx, then upload again.")
    if suffix not in TYPES:
        raise ExtractError("UNSUPPORTED", "Only PDF and Excel (.xlsx) BOQs are supported.")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    size = 0
    with tmp:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                tmp.close()
                Path(tmp.name).unlink(missing_ok=True)
                raise ExtractError("TOO_LARGE", f"The file is larger than {MAX_BYTES // (1024 * 1024)} MB.")
            tmp.write(chunk)
    return Path(tmp.name), TYPES[suffix]


@app.post("/v1/inspect")
def inspect(file: UploadFile = File(...)):
    path, file_type = _save_upload(file)
    try:
        if file_type == "pdf":
            cover, pages = inspect_pdf(str(path))
        else:
            result = extract(str(path), "xlsx")
            cover, pages = result.cover, result.stats.pages
        return {"file_type": file_type, "pages": pages, "cover": Cover.model_validate(cover).model_dump()}
    finally:
        path.unlink(missing_ok=True)


@app.post("/v1/extract")
def run_extract(file: UploadFile = File(...)):
    path, file_type = _save_upload(file)
    try:
        result = extract(str(path), file_type)
        log.info("extracted %s: %s items, %s issues", file.filename, result.stats.items, len(result.issues))
        return JSONResponse(content=result.model_dump(mode="json"))
    except ExtractError:
        raise
    except Exception:
        log.exception("extraction failed for %s", file.filename)
        return JSONResponse(
            {"code": "INTERNAL", "message": "The extractor hit an unexpected problem with this file. The admin team has been notified in the logs."},
            status_code=500,
        )
    finally:
        path.unlink(missing_ok=True)
