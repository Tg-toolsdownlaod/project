"""Scans a Telegram group for its topics and video messages."""
import re
from datetime import datetime, timezone
from typing import Any, Optional

from telethon.tl.types import DocumentAttributeFilename, DocumentAttributeVideo

from .db import db
from .telegram_client import get_client, list_topics, normalize_chat_id

# "EP 12", "EP12", "ep-012", "[EP 12]" and friends.
_EP_PATTERNS = [
    re.compile(r"\bEP[\s._-]*0*(\d{1,4})\b", re.IGNORECASE),
    re.compile(r"\bE[\s._-]*0*(\d{1,4})\b", re.IGNORECASE),
    re.compile(r"\bភាគ[\s._-]*0*(\d{1,4})"),
    re.compile(r"\b0*(\d{1,4})\b"),
]


def parse_ep_number(*sources: Optional[str]) -> Optional[int]:
    """Pulls an episode number out of a caption or filename, best effort."""
    for text in sources:
        if not text:
            continue
        for pattern in _EP_PATTERNS:
            match = pattern.search(text)
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    continue
    return None


def _video_info(message) -> Optional[dict[str, Any]]:
    """Returns file details when the message carries a video, else None."""
    document = getattr(message, "document", None)
    if document is None:
        return None
    mime = getattr(document, "mime_type", "") or ""
    attributes = getattr(document, "attributes", []) or []
    is_video = mime.startswith("video/") or any(
        isinstance(a, DocumentAttributeVideo) for a in attributes
    )
    if not is_video:
        return None

    file_name = next(
        (a.file_name for a in attributes if isinstance(a, DocumentAttributeFilename)),
        None,
    )
    duration = next(
        (int(a.duration) for a in attributes if isinstance(a, DocumentAttributeVideo)),
        0,
    )
    return {
        "file_name": file_name or f"{message.id}.mp4",
        "file_size": int(getattr(document, "size", 0) or 0),
        "duration": duration,
        "mime_type": mime or "video/mp4",
    }


def _topic_id_of(message) -> Optional[int]:
    """The forum topic a message belongs to, or None outside a forum."""
    reply_to = getattr(message, "reply_to", None)
    if reply_to is None:
        return None
    if not getattr(reply_to, "forum_topic", False):
        return None
    return getattr(reply_to, "reply_to_top_id", None) or getattr(reply_to, "reply_to_msg_id", None)


async def scan_group(group_id: str, message_limit: int = 3000) -> dict[str, Any]:
    """Syncs one group's topics and videos into Supabase. Safe to re-run."""
    group_res = db().table("groups").select("*").eq("id", group_id).limit(1).execute()
    rows = group_res.data or []
    if not rows:
        raise ValueError(f"No group with id {group_id}.")
    group = rows[0]

    client = await get_client()
    entity = await client.get_entity(normalize_chat_id(group["chat_id"]))
    is_forum = bool(getattr(entity, "forum", False))

    # 1. Topics — keyed by their Telegram id so re-scans update instead of duplicate.
    existing_topics = db().table("topics").select("*").eq("group_id", group_id).execute().data or []
    topic_rows: dict[str, dict[str, Any]] = {
        str(t.get("topic_id")): t for t in existing_topics if t.get("topic_id")
    }

    if is_forum:
        for topic in await list_topics(entity):
            known = topic_rows.get(topic["topic_id"])
            if known:
                if known.get("title") != topic["title"]:
                    db().table("topics").update({"title": topic["title"]}).eq("id", known["id"]).execute()
                    known["title"] = topic["title"]
            else:
                inserted = db().table("topics").insert({
                    "group_id": group_id,
                    "topic_id": topic["topic_id"],
                    "title": topic["title"],
                }).execute()
                if inserted.data:
                    topic_rows[topic["topic_id"]] = inserted.data[0]

    # 2. Videos — one pass over the history, bucketed into topics as we go.
    existing_eps = db().table("episodes").select("id, message_id").eq("group_id", group_id).execute().data or []
    known_message_ids = {str(e["message_id"]) for e in existing_eps if e.get("message_id")}

    new_episodes: list[dict[str, Any]] = []
    seen = 0
    async for message in client.iter_messages(entity, limit=message_limit):
        seen += 1
        info = _video_info(message)
        if info is None:
            continue
        if str(message.id) in known_message_ids:
            continue

        topic_key = _topic_id_of(message)
        topic_row = topic_rows.get(str(topic_key)) if topic_key else None
        caption = getattr(message, "message", None) or ""

        new_episodes.append({
            "group_id": group_id,
            "topic_id": topic_row["id"] if topic_row else None,
            "message_id": str(message.id),
            "ep_number": parse_ep_number(caption, info["file_name"]),
            "title": caption.split("\n")[0][:200] or None,
            "file_name": info["file_name"],
            "file_size": info["file_size"],
            "duration": info["duration"],
            "status": "pending",
        })
        known_message_ids.add(str(message.id))

    for chunk_start in range(0, len(new_episodes), 200):
        db().table("episodes").insert(new_episodes[chunk_start:chunk_start + 200]).execute()

    # 3. Counters the UI reads off the group and topic rows.
    all_eps = db().table("episodes").select("id, topic_id, status").eq("group_id", group_id).execute().data or []
    db().table("groups").update({
        "is_forum": is_forum,
        "title": getattr(entity, "title", group["title"]) or group["title"],
        "username": getattr(entity, "username", None),
        "total_episodes": len(all_eps),
        "downloaded_episodes": sum(1 for e in all_eps if e["status"] == "completed"),
        "last_scanned_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", group_id).execute()

    for topic in topic_rows.values():
        in_topic = [e for e in all_eps if e["topic_id"] == topic["id"]]
        db().table("topics").update({
            "total_episodes": len(in_topic),
            "downloaded_episodes": sum(1 for e in in_topic if e["status"] == "completed"),
        }).eq("id", topic["id"]).execute()

    return {
        "success": True,
        "messages_scanned": seen,
        "topics": len(topic_rows),
        "new_episodes": len(new_episodes),
        "total_episodes": len(all_eps),
    }
