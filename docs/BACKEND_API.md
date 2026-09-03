# Backend API contract

The frontend calls this API through `src/lib/backend.ts`. Every call is:

- `POST {VITE_TELEGRAM_BACKEND_URL}{path}`
- Header `x-api-key: {VITE_TELEGRAM_BACKEND_KEY}`
- JSON body (`{}` when there is nothing to send)

A response is treated as failed when the HTTP status is not 2xx **or** the body
contains `success: false`. The error shown to the user comes from `error`:

```json
{ "success": false, "error": "Could not connect to this group." }
```

The reference implementation lives in [`../backend-node`](../backend-node)
(Node.js + teleproto).

---

## Telegram login

### `POST /api/telegram/send-code`
Sends the login code to the configured phone number.

```json
{ "success": true, "phone": "+855..." }
```

### `POST /api/telegram/verify-code`
```json
{ "code": "12345", "password": "optional 2FA password" }
```
When the account has 2FA, reply with `needsPassword` and the UI asks for it,
then calls again with `password` set:
```json
{ "success": true, "needsPassword": true }
```
On success the service stores the session and account details in
`telegram_settings`:
```json
{ "success": true, "needsPassword": false, "account": { "id": "1", "username": "me", "first_name": "…" } }
```

### `POST /api/telegram/logout`
Signs out and clears the stored session. `{ "success": true }`

---

## Groups

### `POST /api/telegram/groups/resolve`
Looks a chat up **before** it is saved, so the UI can show the real name. Used
by both the Add Group and Forward dialogs.

```json
{ "chat_id": "-1001234567890" }
```
```json
{
  "success": true,
  "title": "My Anime Group",
  "username": "myanime",
  "is_forum": true,
  "participants_count": 1204,
  "topics": [ { "topic_id": "12", "title": "Season 1" } ]
}
```
`chat_id` may be `-100…`, a bare id, `@name` or a `t.me/…` link.

### `POST /api/telegram/groups/{group_id}/scan`
`group_id` is the **Supabase `groups.id` UUID**, not the Telegram chat ID.
Syncs topics and video messages into `topics` and `episodes`, and refreshes the
`total_episodes` / `downloaded_episodes` counters. Safe to re-run: messages
already stored are skipped.

Optional body: `{ "limit": 3000 }` — how far back to read.

```json
{ "success": true, "messages_scanned": 2841, "topics": 7, "new_episodes": 32, "total_episodes": 118 }
```

### `POST /api/telegram/dialogs`
The groups and channels the account is already in, so the Add Group dialog can
offer a list instead of asking for a chat ID. Private chats and bots are left
out.

Optional body: `{ "limit": 200 }`
```json
{
  "success": true,
  "dialogs": [
    { "chat_id": "-1001234567890", "title": "My Anime Group", "username": "myanime", "is_forum": true, "participants_count": 1204 }
  ]
}
```

### `POST /api/telegram/join`
Joins a public `@name` or a `t.me/+hash` invite link and describes what it
joined, so the group can be added in one step. Already being a member counts as
success.

```json
{ "invite": "https://t.me/+AbCdEf" }
```
```json
{ "success": true, "chat_id": "-1001234567890", "title": "My Anime Group", "username": null, "is_forum": false, "topics": [] }
```

### `POST /api/telegram/notify`
Sends a short note to the account's own Saved Messages — a batch-finished
report that needs no push service or email.

```json
{ "text": "12 episodes uploaded to R2." }
```

---

## Downloads

### `POST /api/downloads/{download_id}/start`
Starts one queued download immediately instead of waiting for the worker.
Returns as soon as it is scheduled; progress is written to the `downloads` row
(`progress`, `downloaded_bytes`, `total_bytes`, `status`).

### `POST /api/downloads/{download_id}/cancel`
Marks the download cancelled.

### `POST /api/downloads/retry-failed`
Re-queues failed downloads. `{ "success": true, "requeued": 3 }`

### `POST /api/rules/run`
Applies the auto-download rules now. `{ "success": true, "queued": 5, "forward_jobs": 1 }`

---

## Forwarding

### `POST /api/telegram/forward/{job_id}/start`
`job_id` is a `forward_jobs.id`. The UI creates the job and its
`forward_job_items` rows first, then calls this. It returns immediately —
a long job would otherwise time the browser out — and reports progress by
updating `forwarded_count` / `failed_count` on the job and the `status` of each
item.

```json
{ "success": true, "status": "started" }
```

A job with `auto_follow = true` goes back to `queued` rather than `completed`,
so the worker keeps relaying newly scanned videos to the same destination.

### `POST /api/telegram/forward/{job_id}/cancel`
Cancels the job and turns off `auto_follow`.

### `POST /api/telegram/mirror/{mirror_id}/prepare`
`mirror_id` is a `group_mirrors.id`. Creates a matching topic in the
destination for every source topic that holds videos (remembered in
`mirror_topic_map`, so a re-run reuses them), then queues one forward job per
topic. Returns immediately — creating topics and queueing thousands of videos
takes a while — and reports through `group_mirrors.status`.

Safe to call again: it tops up existing jobs with videos found by a later
scan, which is how "keep the branch in sync" works.

```json
{ "success": true, "status": "preparing" }
```

### `POST /api/telegram/mirror/{mirror_id}/cancel`
Cancels the mirror and every queued or running job it spawned. Videos already
copied stay in the destination.

#### How a copy is made

`forward_jobs.copy_mode` (inherited from the mirror) decides:

| Mode | What happens |
| --- | --- |
| `forward` | A real forward, or a by-reference re-send into a topic. Copied server-side: no bytes pass through the service. |
| `reupload` | The video is downloaded and uploaded again as a new file. Slow and uses bandwidth, but it is the only thing that works against a group with content protection. |
| `auto` | Forward first; re-upload only when Telegram refuses (`CHAT_FORWARDS_RESTRICTED` and friends). The default. |

---

## Storage

### `POST /api/r2/test`
Verifies the stored R2 credentials by listing the bucket, and sets
`r2_settings.connected`.

```json
{ "success": true, "bucket": "vidoes-ep", "object_count": 812, "total_bytes": 421337620480 }
```

`object_count` and `total_bytes` are optional — the R2 page falls back to what
it knows from the `episodes` table when they are absent.

---

## Speed and rate-limit tuning

None of these are separate endpoints — they are environment variables the
service reads on boot (`backend-node/.env.example`):

| Variable | Default | What it does |
| --- | --- | --- |
| `MAX_CONCURRENT_DOWNLOADS` | unset (uses `download_settings.concurrent_downloads`, default 3) | No hardcoded ceiling — raise it as high as the host's CPU/disk/network allow. |
| `TELEGRAM_MAX_DOWNLOAD_SESSIONS` | unset (library default: up to 8, auto-scaling) | Raises the per-file parallel-connection ceiling teleproto already uses. |
| `FORWARD_PAUSE_MS` | 1500 | Courtesy gap between forwards, to trigger fewer flood waits. Not a hard limit. |

Every download and forward call is wrapped so a real `FLOOD_WAIT` from
Telegram is waited out in full and retried automatically (up to 6 attempts)
rather than counted as a failure. There is no way to disable Telegram's own
per-account throttle — see `backend-node/README.md` § *Speed and limits* for
the honest version of what "as fast as possible" means here.

## Health

### `GET /health`
The one route without an API key, safe to poll from the UI.

```json
{ "success": true, "telegram": true, "r2": true }
```
