"""HTTP API the TG Downloader frontend talks to.

Every route is a POST guarded by the x-api-key header, matching how the
frontend's callBackend() helper sends requests.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Body, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import forwarder, r2, telegram_client, worker
from .config import settings
from .db import db, upsert_single
from .downloader import apply_auto_rules, retry_failed, run_download
from .scanner import scan_group

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("api")

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Runs the background worker for as long as the API is up."""
    task = asyncio.create_task(worker.loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="TG Downloader userbot", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def spawn(coro, label: str) -> None:
    """Fire-and-forget a background task, logging instead of swallowing crashes."""
    task = asyncio.create_task(coro)

    def report(finished: asyncio.Task) -> None:
        if not finished.cancelled() and finished.exception():
            log.error("%s failed: %s", label, finished.exception())

    task.add_done_callback(report)


def require_api_key(x_api_key: str = Header(default="")) -> None:
    """Rejects anything that does not carry the shared secret."""
    if not settings.api_key:
        raise HTTPException(status_code=500, detail="BACKEND_API_KEY is not configured on the server.")
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key.")


# The frontend reads {success, error} off every response, so both the
# deliberate 4xx replies and unexpected crashes have to keep that shape --
# FastAPI's default {"detail": ...} body would leave the user with a generic
# "Request to backend failed." instead of the real reason.


@app.exception_handler(HTTPException)
async def http_error(_request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
    )


@app.middleware("http")
async def crash_to_json(request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        log.exception("Request failed: %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)[:500]})


# ---------------------------------------------------------------- health


@app.get("/health")
async def health() -> dict[str, Any]:
    """Unauthenticated liveness probe, safe to poll from the UI."""
    return {
        "success": True,
        "telegram": await telegram_client.is_authorized(),
        "r2": r2.ping(),
    }


# ---------------------------------------------------------------- telegram login


@app.post("/api/telegram/send-code", dependencies=[Depends(require_api_key)])
async def send_code() -> dict[str, Any]:
    return await telegram_client.send_code()


@app.post("/api/telegram/verify-code", dependencies=[Depends(require_api_key)])
async def verify_code(payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    code = str(payload.get("code") or "")
    password: Optional[str] = payload.get("password") or None
    if not code and not password:
        raise HTTPException(status_code=400, detail="A code or password is required.")
    return await telegram_client.verify_code(code, password)


@app.post("/api/telegram/logout", dependencies=[Depends(require_api_key)])
async def logout() -> dict[str, Any]:
    return await telegram_client.logout()


# ---------------------------------------------------------------- groups


@app.post("/api/telegram/groups/resolve", dependencies=[Depends(require_api_key)])
async def resolve_group(payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    chat_id = str(payload.get("chat_id") or "").strip()
    if not chat_id:
        raise HTTPException(status_code=400, detail="chat_id is required.")
    return await telegram_client.describe_group(chat_id)


@app.post("/api/telegram/groups/{group_id}/scan", dependencies=[Depends(require_api_key)])
async def scan(group_id: str, payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    limit = int(payload.get("limit") or 3000)
    return await scan_group(group_id, message_limit=limit)


# ---------------------------------------------------------------- downloads


@app.post("/api/downloads/{download_id}/start", dependencies=[Depends(require_api_key)])
async def start_download(download_id: str) -> dict[str, Any]:
    spawn(run_download(download_id), f"download {download_id}")
    return {"success": True, "status": "started"}


@app.post("/api/downloads/{download_id}/cancel", dependencies=[Depends(require_api_key)])
async def cancel_download(download_id: str) -> dict[str, Any]:
    db().table("downloads").update({"status": "cancelled"}).eq("id", download_id).execute()
    return {"success": True}


@app.post("/api/downloads/retry-failed", dependencies=[Depends(require_api_key)])
async def retry() -> dict[str, Any]:
    return {"success": True, "requeued": retry_failed()}


@app.post("/api/rules/run", dependencies=[Depends(require_api_key)])
async def run_rules() -> dict[str, Any]:
    return {"success": True, **apply_auto_rules()}


# ---------------------------------------------------------------- forwarding


@app.post("/api/telegram/forward/{job_id}/start", dependencies=[Depends(require_api_key)])
async def start_forward(job_id: str) -> dict[str, Any]:
    # Answer immediately: a long job would otherwise time the browser out.
    spawn(forwarder.run_job(job_id), f"forward job {job_id}")
    return {"success": True, "status": "started"}


@app.post("/api/telegram/forward/{job_id}/cancel", dependencies=[Depends(require_api_key)])
async def cancel_forward(job_id: str) -> dict[str, Any]:
    db().table("forward_jobs").update({"status": "cancelled", "auto_follow": False}).eq("id", job_id).execute()
    return {"success": True}


# ---------------------------------------------------------------- r2


@app.post("/api/r2/test", dependencies=[Depends(require_api_key)])
async def test_r2() -> dict[str, Any]:
    result = r2.test_connection()
    upsert_single("r2_settings", {
        "connected": True,
        "last_connected_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"success": True, **result}
