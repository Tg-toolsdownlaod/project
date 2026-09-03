#!/usr/bin/env python3
"""One-off terminal login for the userbot.

Signing in from a terminal avoids passing the code and 2FA password through the
web UI, and prints a session string you can paste into TELEGRAM_SESSION_STRING
so restarts do not need another login.

    python login.py
"""
import asyncio

from telethon import TelegramClient
from telethon.sessions import StringSession

from app.db import telegram_settings, upsert_single


async def main() -> None:
    conf = telegram_settings()
    if not conf["api_id"] or not conf["api_hash"] or not conf["phone"]:
        raise SystemExit("Set TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_PHONE first.")

    client = TelegramClient(StringSession(conf["session_string"] or None), int(conf["api_id"]), conf["api_hash"])
    await client.start(phone=conf["phone"])

    me = await client.get_me()
    session_string = StringSession.save(client.session)

    print("\nSigned in as", me.first_name, f"(@{me.username})" if me.username else "")
    print("\nPaste this into your .env as TELEGRAM_SESSION_STRING:\n")
    print(session_string)

    if input("\nAlso store it in Supabase? [y/N] ").strip().lower() == "y":
        upsert_single("telegram_settings", {"session_string": session_string, "connected": True})
        print("Stored. Note that anyone holding the anon key can then read it.")

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
