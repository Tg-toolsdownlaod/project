# telegramtools

TG Downloader — browse Telegram groups by topic, download the videos to
Cloudflare R2, and forward them into another group.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-n79oik6v)

## What is in here

| Path | What it is |
| --- | --- |
| `src/` | The React + Vite frontend (deployed to Vercel) |
| `supabase/migrations/` | Database schema |
| `backend-node/` | Userbot service — Node.js + teleproto |
| `docs/BACKEND_API.md` | The API contract between frontend and backend |

The frontend on its own can browse and organise what is already in the
database; scanning, downloading and forwarding need the backend service
running.

## Running it

```bash
npm install
npm run dev
```

The frontend needs these environment variables:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_TELEGRAM_BACKEND_URL=http://localhost:8000
VITE_TELEGRAM_BACKEND_KEY=
```

Then start a backend — see [`backend-node/README.md`](backend-node/README.md).
