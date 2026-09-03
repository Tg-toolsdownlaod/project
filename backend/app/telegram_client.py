"""Telethon userbot: one shared client, plus the interactive login flow."""
import asyncio
from datetime import datetime, timezone
from typing import Any, Optional

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession
from telethon.tl.functions.channels import GetForumTopicsRequest, GetFullChannelRequest
from telethon.tl.types import Channel, Chat

from .db import telegram_settings, upsert_single

_client: Optional[TelegramClient] = None
_lock = asyncio.Lock()
# Held between /send-code and /verify-code.
_pending: dict[str, Any] = {}


class TelegramNotConfigured(RuntimeError):
    pass


class TelegramNotAuthorized(RuntimeError):
    pass


async def get_client(require_auth: bool = True) -> TelegramClient:
    """Returns the connected shared client, creating it on first use."""
    global _client
    async with _lock:
        if _client is None:
            conf = telegram_settings()
            if not conf["api_id"] or not conf["api_hash"]:
                raise TelegramNotConfigured("Telegram api_id/api_hash are not set.")
            _client = TelegramClient(
                StringSession(conf["session_string"] or None),
                int(conf["api_id"]),
                conf["api_hash"],
            )
        if not _client.is_connected():
            await _client.connect()

    if require_auth and not await _client.is_user_authorized():
        raise TelegramNotAuthorized("The userbot is not signed in yet.")
    return _client


async def is_authorized() -> bool:
    try:
        client = await get_client(require_auth=False)
        return await client.is_user_authorized()
    except Exception:
        return False


async def send_code() -> dict[str, Any]:
    """Starts the login by asking Telegram to send the confirmation code."""
    conf = telegram_settings()
    if not conf["phone"]:
        raise TelegramNotConfigured("No phone number is configured.")
    client = await get_client(require_auth=False)
    sent = await client.send_code_request(conf["phone"])
    _pending["phone"] = conf["phone"]
    _pending["phone_code_hash"] = sent.phone_code_hash
    return {"success": True, "phone": conf["phone"]}


async def verify_code(code: str, password: Optional[str] = None) -> dict[str, Any]:
    """Completes the login, asking for the 2FA password when Telegram wants one."""
    client = await get_client(require_auth=False)
    phone = _pending.get("phone") or telegram_settings()["phone"]

    try:
        if password:
            await client.sign_in(password=password)
        else:
            await client.sign_in(
                phone=phone,
                code=code,
                phone_code_hash=_pending.get("phone_code_hash"),
            )
    except SessionPasswordNeededError:
        return {"success": True, "needsPassword": True}

    me = await client.get_me()
    session_string = StringSession.save(client.session)
    upsert_single(
        "telegram_settings",
        {
            "session_string": session_string,
            "connected": True,
            "last_connected_at": datetime.now(timezone.utc).isoformat(),
            "account_first_name": me.first_name,
            "account_last_name": me.last_name,
            "account_username": me.username,
            "account_user_id": str(me.id),
        },
    )
    _pending.clear()
    return {
        "success": True,
        "needsPassword": False,
        "session_string": session_string,
        "account": {"id": str(me.id), "username": me.username, "first_name": me.first_name},
    }


async def logout() -> dict[str, Any]:
    """Signs the userbot out and clears the stored session."""
    global _client
    client = await get_client(require_auth=False)
    try:
        await client.log_out()
    finally:
        _client = None
        _pending.clear()
        upsert_single(
            "telegram_settings",
            {
                "session_string": None,
                "connected": False,
                "account_first_name": None,
                "account_last_name": None,
                "account_username": None,
                "account_user_id": None,
            },
        )
    return {"success": True}


def normalize_chat_id(chat_id: str) -> Any:
    """Accepts -100..., a bare id, @name or a t.me link and returns what Telethon wants."""
    value = (chat_id or "").strip()
    if not value:
        raise ValueError("A chat ID is required.")
    if value.startswith("https://t.me/"):
        value = "@" + value.rsplit("/", 1)[-1]
    if value.startswith("@"):
        return value
    try:
        return int(value)
    except ValueError:
        return value


async def resolve_entity(chat_id: str):
    client = await get_client()
    return await client.get_entity(normalize_chat_id(chat_id))


async def describe_group(chat_id: str) -> dict[str, Any]:
    """Everything the Add/Forward dialogs show before anything is written."""
    client = await get_client()
    entity = await client.get_entity(normalize_chat_id(chat_id))
    is_forum = bool(getattr(entity, "forum", False))

    participants = None
    if isinstance(entity, (Channel, Chat)):
        try:
            full = await client(GetFullChannelRequest(entity))
            participants = getattr(full.full_chat, "participants_count", None)
        except Exception:
            participants = None

    topics: list[dict[str, str]] = []
    if is_forum:
        topics = await list_topics(entity)

    return {
        "success": True,
        "title": getattr(entity, "title", None) or getattr(entity, "username", "") or str(chat_id),
        "username": getattr(entity, "username", None),
        "is_forum": is_forum,
        "participants_count": participants,
        "topics": topics,
    }


async def list_topics(entity) -> list[dict[str, str]]:
    """Reads the forum topics of a group, paging until Telegram stops sending more."""
    client = await get_client()
    found: list[dict[str, str]] = []
    offset_topic = 0
    offset_id = 0
    offset_date = 0

    while True:
        result = await client(
            GetForumTopicsRequest(
                channel=entity,
                offset_date=offset_date,
                offset_id=offset_id,
                offset_topic=offset_topic,
                limit=100,
            )
        )
        batch = [t for t in result.topics if getattr(t, "title", None)]
        if not batch:
            break
        for topic in batch:
            found.append({"topic_id": str(topic.id), "title": topic.title})
        if len(batch) < 100:
            break
        offset_topic = batch[-1].id
        offset_id = getattr(result.messages[-1], "id", 0) if result.messages else 0
        offset_date = getattr(result.messages[-1], "date", 0) if result.messages else 0

    return found
