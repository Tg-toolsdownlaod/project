# TG Downloader — userbot service (Node.js)

The reference backend the frontend talks to, in Node. It signs in as your
Telegram account (a "userbot"), scans groups for videos, downloads them,
uploads them to Cloudflare R2, and forwards videos from one group into another.

Requires only Node — one runtime, one `npm install`. Run **one** instance: the
Telegram session is stateful, and two userbots sharing it will fight over it.

```
src/
  server.js      Express routes (the API the frontend calls)
  worker.js      background loop: auto rules, download queue, auto-forward
  telegram.js    userbot session, login, group/topic lookup
  scanner.js     group -> topics -> video episodes, into Supabase
  downloader.js  download queue -> local disk -> R2
  forwarder.js   forward jobs: copy videos into another group
  r2.js          Cloudflare R2 (S3-compatible) client
  db.js          Supabase access with the service-role key
  config.js      environment configuration
  login.js       one-off terminal login, prints a session string
```

Requires **Node 20 or newer**.

## Setup

```bash
cd backend-node
cp .env.example .env       # then fill it in
npm install
npm run login              # sign in once, paste the session string into .env
npm start
```

Point the frontend at it:

```
VITE_TELEGRAM_BACKEND_URL=http://localhost:8000
VITE_TELEGRAM_BACKEND_KEY=<the same value as BACKEND_API_KEY>
```

### Windows

Same steps; in PowerShell or CMD:

```
cd backend-node
copy .env.example .env
npm install
npm run login
start.bat
```

Set `DOWNLOAD_DIR` to a path with room for the videos, e.g.
`DOWNLOAD_DIR=D:\tg-downloads`. Files are deleted right after they reach R2,
but a big download needs the space while it runs.

**The deployed frontend cannot call `http://localhost`.** A page served over
HTTPS (Vercel) is not allowed by the browser to call a plain-HTTP address, so
pointing `VITE_TELEGRAM_BACKEND_URL` at your PC only works if the frontend is
also local. Pick one:

| Setup | What to do |
| --- | --- |
| Everything local | `npm run dev` in the project root, and put `VITE_TELEGRAM_BACKEND_URL=http://localhost:8000` in the frontend's `.env` |
| Vercel frontend, backend on your PC | Put an HTTPS tunnel in front of it — `cloudflared tunnel --url http://localhost:8000` prints a public HTTPS URL; use that in the Vercel env vars |
| Always-on | Run it on a small VPS with Docker (below) instead of your PC |

Auto-download and auto-forward only run while this service is running, so on a
home PC they stop when it sleeps or shuts down.

### Docker

```bash
docker build -t tg-downloader-backend-node .
docker run --env-file .env -p 8000:8000 tg-downloader-backend-node
```

Run **one** instance. The Telegram session is stateful, and several userbots
sharing it will fight over it — Telegram may invalidate the session.

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

## Notes on the Telegram library

This uses [teleproto](https://www.npmjs.com/package/teleproto), the maintained
fork of GramJS (the `telegram` package is archived). One API difference matters
here: forum topics are fetched with `messages.GetForumTopics`, not
`channels.GetForumTopics` as in older GramJS.

## Rate limits

Telegram will flood-wait an account that forwards too fast. The forwarder
pauses 1.5s between messages; raise `PAUSE_BETWEEN_MESSAGES` in
`forwarder.js` if you hit a flood-wait error on large batches. Scanning reads
at most 3000 messages per call — pass `{"limit": N}` to the scan endpoint for
a deeper history.

## Forwarding, and why it does not re-upload

A plain forward (`forwardMessages`) is used when the destination has no topic.
When you forward *into a forum topic*, Telegram's forward call cannot target a
topic, so the service re-sends the same media object with `replyTo=<topic id>`.
The existing file reference is reused, so nothing is downloaded or uploaded
again — but the message loses its "forwarded from" header.

Groups with content protection enabled cannot be forwarded from at all; those
items are marked failed with the error Telegram returned.

See [`../docs/BACKEND_API.md`](../docs/BACKEND_API.md) for the endpoint contract.
