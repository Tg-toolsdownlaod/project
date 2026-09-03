# TG Downloader — userbot service

The reference backend the frontend talks to. It signs in as your Telegram
account (a "userbot"), scans groups for videos, downloads them, uploads them to
Cloudflare R2, and forwards videos from one group into another.

The frontend reaches it through `VITE_TELEGRAM_BACKEND_URL`, sending every
request as a POST with an `x-api-key` header.

```
app/
  main.py             FastAPI routes (the API the frontend calls)
  worker.py           background loop: auto rules, download queue, auto-forward
  telegram_client.py  Telethon session, login, group/topic lookup
  scanner.py          group -> topics -> video episodes, into Supabase
  downloader.py       download queue -> local disk -> R2
  forwarder.py        forward jobs: copy videos into another group
  r2.py               Cloudflare R2 (S3-compatible) client
  db.py               Supabase access with the service-role key
  config.py           environment configuration
login.py              one-off terminal login, prints a session string
```

## Setup

```bash
cd backend
cp .env.example .env         # then fill it in
pip install "setuptools<78" wheel   # see the note below
pip install -r requirements.txt
python login.py              # sign in once, paste the session string into .env
uvicorn app.main:app --reload --port 8000
```

Point the frontend at it:

```
VITE_TELEGRAM_BACKEND_URL=http://localhost:8000
VITE_TELEGRAM_BACKEND_KEY=<the same value as BACKEND_API_KEY>
```

If `pip install` fails building **pyaes**, that is the pinned setuptools above:
Telethon depends on pyaes, which publishes only an sdist with a legacy
`setup.py`, and setuptools 78 removed `setup.py install`. Installing
`setuptools<78` first (as the Dockerfile does) fixes it.

### Docker

```bash
docker build -t tg-downloader-backend .
docker run --env-file .env -p 8000:8000 tg-downloader-backend
```

This service is stateful in one way that matters: it holds the Telegram
session. Run **one** instance — several userbots sharing a session will fight
over it and Telegram may invalidate it.

## Credentials

`api_id`, `api_hash`, the session string and the R2 secret key are read from
the environment first, and only fall back to the Supabase tables when the
environment does not set them.

**Prefer the environment.** The frontend's anon key ships inside the JavaScript
bundle, and the current RLS policies let `anon` read every table — so anything
stored in `telegram_settings` or `r2_settings` is readable by anyone who opens
the deployed site. A leaked `session_string` is full control of your Telegram
account. Keeping the secrets here, and letting the database hold only status
(`connected`, `account_username`), closes that hole without changing the UI.

The Supabase key this service uses must be the **service role** key, never the
anon key: it writes scan results and download progress with RLS bypassed.

## What the worker does

Every `WORKER_INTERVAL` seconds (default 30), while the userbot is signed in:

1. **Auto rules** — finds `pending` episodes matching an active
   `auto_download_rules` row (episode range, minimum file size), queues them,
   and creates a forward job when the rule has a forward target.
2. **Download queue** — starts up to `concurrent_downloads` queued downloads,
   writing progress into the `downloads` row as it goes, then uploads to R2
   using the `r2_folder_pattern` from `download_settings`.
3. **Auto-follow forwards** — adds newly scanned videos to forward jobs with
   `auto_follow = true`, then works any queued job.

## Rate limits

Telegram will flood-wait an account that forwards too fast. The forwarder
pauses 1.5s between messages; raise `_PAUSE_BETWEEN_MESSAGES` in
`forwarder.py` if you hit `FloodWaitError` on large batches. Scanning reads at
most 3000 messages per call — pass `{"limit": N}` to the scan endpoint for a
deeper history.

## Forwarding, and why it does not re-upload

A plain forward (`forward_messages`) is used when the destination has no topic.
When you forward *into a forum topic*, Telegram's forward call cannot target a
topic, so the service re-sends the same media object with `reply_to=<topic id>`.
Telethon reuses the existing file reference, so nothing is downloaded or
uploaded again — but the message loses its "forwarded from" header.

Groups with content protection enabled (`noforwards`) cannot be forwarded from
at all; those items are marked failed with the error Telegram returned.

See [`../docs/BACKEND_API.md`](../docs/BACKEND_API.md) for the endpoint contract.
