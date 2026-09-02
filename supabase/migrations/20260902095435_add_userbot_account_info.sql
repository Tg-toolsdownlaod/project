/*
# Add userbot account info to telegram_settings

## Purpose
After the userbot connects to Telegram, we want to store and display
the connected account's identity (first name, last name, username, user id)
so the operator can see at a glance which Telegram account is active.

## Changes
1. `telegram_settings` — add 4 nullable text columns:
   - `account_first_name` — the connected account's first name
   - `account_last_name` — the connected account's last name (optional)
   - `account_username` — the connected account's @username (optional)
   - `account_user_id` — the numeric Telegram user ID as text

All columns are nullable so existing rows are not affected. No data is lost.

## Security
- RLS is already enabled on `telegram_settings` with anon+authenticated CRUD.
- No policy changes needed — the new columns are covered by existing policies.
*/

ALTER TABLE telegram_settings
  ADD COLUMN IF NOT EXISTS account_first_name text,
  ADD COLUMN IF NOT EXISTS account_last_name text,
  ADD COLUMN IF NOT EXISTS account_username text,
  ADD COLUMN IF NOT EXISTS account_user_id text;
