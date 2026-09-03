"""Runs forward jobs: copies videos from a source topic into another group."""
import asyncio
from datetime import datetime, timezone
from typing import Any, Optional

from .db import db
from .telegram_client import get_client, normalize_chat_id

# Telegram rate limits forwards hard; this pause keeps a long job alive.
_PAUSE_BETWEEN_MESSAGES = 1.5
_running: set[str] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_job(job_id: str) -> dict[str, Any]:
    """Forwards every pending item of a job. Re-entrant: already-running is a no-op."""
    if job_id in _running:
        return {"success": True, "status": "already running"}
    _running.add(job_id)
    try:
        return await _run(job_id)
    finally:
        _running.discard(job_id)


async def _run(job_id: str) -> dict[str, Any]:
    rows = db().table("forward_jobs").select("*").eq("id", job_id).limit(1).execute().data or []
    if not rows:
        raise ValueError(f"No forward job with id {job_id}.")
    job = rows[0]

    db().table("forward_jobs").update({"status": "running", "started_at": _now(), "error": None}).eq("id", job_id).execute()

    try:
        client = await get_client()
        target = await client.get_entity(normalize_chat_id(job["target_chat_id"]))
        target_topic = int(job["target_topic_id"]) if job.get("target_topic_id") else None

        source_entity = None
        if job.get("source_group_id"):
            group_rows = db().table("groups").select("chat_id").eq("id", job["source_group_id"]).limit(1).execute().data or []
            if group_rows:
                source_entity = await client.get_entity(normalize_chat_id(group_rows[0]["chat_id"]))

        items = db().table("forward_job_items").select("*").eq("job_id", job_id).eq("status", "pending").execute().data or []
        forwarded = int(job.get("forwarded_count") or 0)
        failed = int(job.get("failed_count") or 0)

        for item in items:
            episode = _episode_of(item)
            if episode is None or not episode.get("message_id"):
                _mark(item["id"], "skipped", error="The episode is gone or has no message ID.")
                continue

            try:
                await _forward_one(client, source_entity, target, target_topic, int(episode["message_id"]), item["id"])
                forwarded += 1
            except Exception as exc:  # one bad message must not kill the job
                failed += 1
                _mark(item["id"], "failed", error=str(exc)[:500])

            db().table("forward_jobs").update({
                "forwarded_count": forwarded,
                "failed_count": failed,
            }).eq("id", job_id).execute()
            await asyncio.sleep(_PAUSE_BETWEEN_MESSAGES)

        # An auto-following job stays queued so newly scanned videos get picked up.
        final_status = "queued" if job.get("auto_follow") else ("completed" if failed == 0 else "failed")
        db().table("forward_jobs").update({
            "status": final_status,
            "completed_at": None if job.get("auto_follow") else _now(),
            "error": None if failed == 0 else f"{failed} video(s) could not be forwarded.",
        }).eq("id", job_id).execute()

        return {"success": True, "forwarded": forwarded, "failed": failed, "status": final_status}

    except Exception as exc:
        db().table("forward_jobs").update({
            "status": "failed",
            "error": str(exc)[:500],
            "completed_at": _now(),
        }).eq("id", job_id).execute()
        raise


async def _forward_one(client, source_entity, target, target_topic: Optional[int], message_id: int, item_id: str) -> None:
    """Forwards one message, falling back to a re-send when forwarding is blocked."""
    sent = None
    if target_topic is None and source_entity is not None:
        sent = await client.forward_messages(target, message_id, from_peer=source_entity)
    else:
        # Forum topics (and forward-restricted chats) need a fresh send. The file
        # reference is reused, so nothing is downloaded or uploaded again.
        message = await client.get_messages(source_entity, ids=message_id)
        if message is None or message.media is None:
            raise RuntimeError("The source message no longer has media.")
        sent = await client.send_file(
            target,
            message.media,
            caption=message.message or "",
            reply_to=target_topic,
        )

    sent_id = sent[0].id if isinstance(sent, list) and sent else getattr(sent, "id", None)
    _mark(item_id, "forwarded", message_id=str(sent_id) if sent_id else None)


def _episode_of(item: dict[str, Any]) -> Optional[dict[str, Any]]:
    if not item.get("episode_id"):
        return None
    rows = db().table("episodes").select("*").eq("id", item["episode_id"]).limit(1).execute().data or []
    return rows[0] if rows else None


def _mark(item_id: str, status: str, message_id: Optional[str] = None, error: Optional[str] = None) -> None:
    db().table("forward_job_items").update({
        "status": status,
        "forwarded_message_id": message_id,
        "error": error,
        "forwarded_at": _now() if status == "forwarded" else None,
    }).eq("id", item_id).execute()


def sync_auto_follow_jobs() -> int:
    """Adds newly scanned videos to jobs that are set to keep forwarding."""
    jobs = db().table("forward_jobs").select("*").eq("auto_follow", True).in_("status", ["queued", "completed"]).execute().data or []
    added_total = 0

    for job in jobs:
        query = db().table("episodes").select("id")
        if job.get("source_topic_id"):
            query = query.eq("topic_id", job["source_topic_id"])
        elif job.get("source_group_id"):
            query = query.eq("group_id", job["source_group_id"])
        else:
            continue

        episode_ids = {row["id"] for row in (query.execute().data or [])}
        existing = db().table("forward_job_items").select("episode_id").eq("job_id", job["id"]).execute().data or []
        already = {row["episode_id"] for row in existing}

        new_ids = episode_ids - already
        if not new_ids:
            continue

        db().table("forward_job_items").insert(
            [{"job_id": job["id"], "episode_id": eid, "status": "pending"} for eid in new_ids]
        ).execute()
        db().table("forward_jobs").update({
            "total_count": len(already) + len(new_ids),
            "status": "queued",
        }).eq("id", job["id"]).execute()
        added_total += len(new_ids)

    return added_total
