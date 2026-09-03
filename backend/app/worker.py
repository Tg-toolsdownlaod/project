"""Background loop: auto rules, the download queue, and auto-following forwards."""
import asyncio
import logging

from . import forwarder
from .config import settings
from .db import db
from .downloader import apply_auto_rules, process_queue
from .telegram_client import is_authorized

log = logging.getLogger("worker")


async def loop() -> None:
    """Runs one pass every WORKER_INTERVAL seconds until the process stops."""
    while True:
        try:
            if await is_authorized():
                await _pass()
        except Exception:  # a bad pass must never kill the loop
            log.exception("Worker pass failed")
        await asyncio.sleep(settings.worker_interval)


async def _pass() -> None:
    rules = apply_auto_rules()
    if rules["queued"]:
        log.info("Auto rules queued %s episode(s)", rules["queued"])

    started = await process_queue()
    if started:
        log.info("Started %s download(s)", started)

    added = forwarder.sync_auto_follow_jobs()
    if added:
        log.info("Auto-follow added %s video(s) to forward jobs", added)

    pending_jobs = db().table("forward_jobs").select("id").eq("status", "queued").limit(3).execute().data or []
    for job in pending_jobs:
        try:
            await forwarder.run_job(job["id"])
        except Exception:
            log.exception("Forward job %s failed", job["id"])
