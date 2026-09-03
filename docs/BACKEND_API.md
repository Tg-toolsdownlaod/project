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

The reference implementation lives in [`../backend`](../backend).

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

## Health

### `GET /health`
The one route without an API key, safe to poll from the UI.

```json
{ "success": true, "telegram": true, "r2": true }
```
