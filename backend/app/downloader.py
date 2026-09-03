"""Works the download queue: Telegram -> local disk -> R2."""
import asyncio
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional

from . import r2
from .config import settings
from .db import db, download_settings
from .telegram_client import get_client, normalize_chat_id

_running: set[str] = set()


# Windows rejects these in a filename; Telegram captions are full of them.
_ILLEGAL_IN_FILENAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_filename(name: str) -> str:
    """Makes a Telegram filename safe to write on any OS."""
    cleaned = _ILLEGAL_IN_FILENAME.sub("_", name or "").strip(" .")
    return (cleaned or "video.mp4")[:120]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def process_queue() -> int:
    """Starts as many queued downloads as the concurrency limit allows."""
    conf = download_settings()
    limit = settings.max_concurrent_downloads or int(conf["concurrent_downloads"] or 3)
    free_slots = max(limit - len(_running), 0)
    if free_slots == 0:
        return 0

    queued = db().table("downloads").select("*").eq("status", "queued").order("queued_at").limit(free_slots).execute().data or []
    started = 0
    for row in queued:
        if row["id"] in _running:
            continue
        asyncio.create_task(run_download(row["id"]))
        started += 1
    return started


async def run_download(download_id: str) -> None:
    """Downloads one episode and uploads it to R2, reporting progress as it goes."""
    if download_id in _running:
        return
    _running.add(download_id)
    local_path: Optional[str] = None

    try:
        rows = db().table("downloads").select("*").eq("id", download_id).limit(1).execute().data or []
        if not rows:
            return
        download = rows[0]

        episodes = db().table("episodes").select("*").eq("id", download["episode_id"]).limit(1).execute().data or []
        if not episodes:
            _fail(download_id, "The episode row is gone.")
            return
        episode = episodes[0]

        groups = db().table("groups").select("*").eq("id", episode["group_id"]).limit(1).execute().data or []
        if not groups:
            _fail(download_id, "The group row is gone.")
            return
        group = groups[0]

        topic_title = ""
        if episode.get("topic_id"):
            topics = db().table("topics").select("title").eq("id", episode["topic_id"]).limit(1).execute().data or []
            topic_title = topics[0]["title"] if topics else ""

        db().table("downloads").update({"status": "downloading", "started_at": _now(), "error": None}).eq("id", download_id).execute()
        db().table("episodes").update({"status": "downloading"}).eq("id", episode["id"]).execute()

        client = await get_client()
        entity = await client.get_entity(normalize_chat_id(group["chat_id"]))
        message = await client.get_messages(entity, ids=int(episode["message_id"]))
        if message is None or message.media is None:
            _fail(download_id, "The source message no longer has media.", episode_id=episode["id"])
            return

        os.makedirs(settings.download_dir, exist_ok=True)
        local_path = os.path.join(
            settings.download_dir,
            f"{download_id}-{safe_filename(episode.get('file_name') or 'video.mp4')}",
        )

        last_report = 0.0

        def on_download(received: int, total: int) -> None:
            nonlocal last_report
            now = time.time()
            if now - last_report < 2:  # keep the write rate sane
                return
            last_report = now
            db().table("downloads").update({
                "progress": int(received / total * 90) if total else 0,
                "downloaded_bytes": received,
                "total_bytes": total,
            }).eq("id", download_id).execute()

        await client.download_media(message, file=local_path, progress_callback=on_download)

        conf = download_settings()
        r2_key = None
        r2_url = None
        if conf["auto_r2_upload"]:
            r2_key = r2.build_key(
                conf["r2_folder_pattern"],
                group["title"],
                topic_title,
                episode.get("ep_number"),
                episode.get("file_name") or "video.mp4",
            )
            db().table("downloads").update({"progress": 92}).eq("id", download_id).execute()
            r2_url = r2.upload(local_path, r2_key)

        db().table("downloads").update({
            "status": "completed",
            "progress": 100,
            "completed_at": _now(),
            "r2_key": r2_key,
            "r2_url": r2_url,
            "downloaded_bytes": os.path.getsize(local_path),
        }).eq("id", download_id).execute()
        db().table("episodes").update({"status": "completed", "r2_key": r2_key}).eq("id", episode["id"]).execute()
        _refresh_counters(group["id"], episode.get("topic_id"))

    except Exception as exc:
        _fail(download_id, str(exc)[:500])
    finally:
        _running.discard(download_id)
        if local_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
            except OSError:
                pass


def _fail(download_id: str, error: str, episode_id: Optional[str] = None) -> None:
    db().table("downloads").update({"status": "failed", "error": error}).eq("id", download_id).execute()
    if episode_id:
        db().table("episodes").update({"status": "failed"}).eq("id", episode_id).execute()


def _refresh_counters(group_id: str, topic_id: Optional[str]) -> None:
    episodes = db().table("episodes").select("id, topic_id, status").eq("group_id", group_id).execute().data or []
    db().table("groups").update({
        "total_episodes": len(episodes),
        "downloaded_episodes": sum(1 for e in episodes if e["status"] == "completed"),
    }).eq("id", group_id).execute()
    if topic_id:
        in_topic = [e for e in episodes if e["topic_id"] == topic_id]
        db().table("topics").update({
            "total_episodes": len(in_topic),
            "downloaded_episodes": sum(1 for e in in_topic if e["status"] == "completed"),
        }).eq("id", topic_id).execute()


def retry_failed() -> int:
    """Re-queues failed downloads while the retry budget allows it."""
    conf = download_settings()
    if not conf["retry_on_fail"]:
        return 0
    failed = db().table("downloads").select("id").eq("status", "failed").limit(20).execute().data or []
    for row in failed:
        db().table("downloads").update({"status": "queued", "error": None}).eq("id", row["id"]).execute()
    return len(failed)


def apply_auto_rules() -> dict[str, int]:
    """Queues episodes that match an active auto-download rule, and relays them."""
    rules = db().table("auto_download_rules").select("*").eq("active", True).execute().data or []
    queued = 0
    forwarded_jobs = 0

    for rule in rules:
        query = db().table("episodes").select("*").eq("group_id", rule["group_id"]).eq("status", "pending")
        if rule.get("topic_id"):
            query = query.eq("topic_id", rule["topic_id"])
        candidates = query.execute().data or []

        matched: list[dict[str, Any]] = []
        for episode in candidates:
            ep = episode.get("ep_number")
            if rule.get("auto_ep_start") is not None and (ep is None or ep < rule["auto_ep_start"]):
                continue
            if rule.get("auto_ep_end") is not None and (ep is None or ep > rule["auto_ep_end"]):
                continue
            min_bytes = int(rule.get("min_file_size_mb") or 0) * 1024 * 1024
            if min_bytes and int(episode.get("file_size") or 0) < min_bytes:
                continue
            matched.append(episode)

        if matched:
            db().table("downloads").insert([
                {"episode_id": e["id"], "status": "queued", "total_bytes": e.get("file_size") or 0}
                for e in matched
            ]).execute()
            db().table("episodes").update({"status": "queued"}).in_("id", [e["id"] for e in matched]).execute()
            queued += len(matched)

            if rule.get("forward_enabled") and rule.get("forward_to_chat_id"):
                job = db().table("forward_jobs").insert({
                    "source_group_id": rule["group_id"],
                    "source_topic_id": rule.get("topic_id"),
                    "target_chat_id": rule["forward_to_chat_id"],
                    "target_topic_id": rule.get("forward_to_topic_id"),
                    "mode": "selected",
                    "status": "queued",
                    "total_count": len(matched),
                    "auto_follow": False,
                }).execute()
                if job.data:
                    db().table("forward_job_items").insert([
                        {"job_id": job.data[0]["id"], "episode_id": e["id"], "status": "pending"}
                        for e in matched
                    ]).execute()
                    forwarded_jobs += 1

        db().table("auto_download_rules").update({"last_check_at": _now()}).eq("id", rule["id"]).execute()

    return {"queued": queued, "forward_jobs": forwarded_jobs}
