/*
# Telegram Video Downloader - Full Schema

## Overview
A single-tenant tool (no auth) for downloading videos from Telegram groups
via a userbot, storing them in Cloudflare R2, with auto-download of new
episodes and a URL list manager.

## New Tables
1. `telegram_settings` — Telegram API connection (api_id, api_hash, session, phone)
2. `r2_settings` — Cloudflare R2 storage configuration (account_id, access_key, secret_key, bucket, endpoint, public_url)
3. `groups` — Telegram groups/channels being monitored (chat_id, title, username, topic_id, active)
4. `topics` — Topics (forum threads) within a group (group_id, topic_id, title, active)
5. `episodes` — Video episodes found in groups/topics (group_id, topic_id, message_id, ep_number, title, file_name, file_size, status)
6. `downloads` — Download job queue (episode_id, status, progress, r2_key, started_at, completed_at, error)
7. `url_lists` — Saved URL link lists (title, description)
8. `url_list_items` — Individual URL entries in a list (url_list_id, url, label, episode_number, status)
9. `auto_download_rules` — Rules for auto-downloading new episodes (group_id, topic_id, auto_ep_start, auto_ep_end, quality_filter, active)
10. `download_settings` — General download config (concurrent_downloads, speed_limit, auto_start, quality_pref, notify_on_complete)

## Security
- Single-tenant app with no login screen.
- RLS enabled on ALL tables.
- Policies use `TO anon, authenticated` so the anon-key frontend can read/write.
- All data is intentionally shared (one operator uses the tool).

## Notes
1. All timestamps default to now().
2. Episode status: 'pending' | 'queued' | 'downloading' | 'completed' | 'failed' | 'skipped'
3. Download status: 'queued' | 'downloading' | 'completed' | 'failed' | 'paused' | 'cancelled'
*/

-- 1. Telegram API Settings
CREATE TABLE IF NOT EXISTS telegram_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_id text,
  api_hash text,
  phone text,
  session_string text,
  connected boolean NOT NULL DEFAULT false,
  last_connected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE telegram_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_tg_settings" ON telegram_settings;
CREATE POLICY "anon_read_tg_settings" ON telegram_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tg_settings" ON telegram_settings;
CREATE POLICY "anon_insert_tg_settings" ON telegram_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tg_settings" ON telegram_settings;
CREATE POLICY "anon_update_tg_settings" ON telegram_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tg_settings" ON telegram_settings;
CREATE POLICY "anon_delete_tg_settings" ON telegram_settings FOR DELETE TO anon, authenticated USING (true);

-- 2. R2 Storage Settings
CREATE TABLE IF NOT EXISTS r2_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text,
  access_key_id text,
  secret_access_key text,
  bucket_name text,
  endpoint_url text,
  public_url text,
  region text DEFAULT 'auto',
  connected boolean NOT NULL DEFAULT false,
  last_connected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE r2_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_r2_settings" ON r2_settings;
CREATE POLICY "anon_read_r2_settings" ON r2_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_r2_settings" ON r2_settings;
CREATE POLICY "anon_insert_r2_settings" ON r2_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_r2_settings" ON r2_settings;
CREATE POLICY "anon_update_r2_settings" ON r2_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_r2_settings" ON r2_settings;
CREATE POLICY "anon_delete_r2_settings" ON r2_settings FOR DELETE TO anon, authenticated USING (true);

-- 3. Groups
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  title text NOT NULL,
  username text,
  is_forum boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  total_episodes int DEFAULT 0,
  downloaded_episodes int DEFAULT 0,
  last_scanned_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_groups" ON groups;
CREATE POLICY "anon_read_groups" ON groups FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_groups" ON groups;
CREATE POLICY "anon_insert_groups" ON groups FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_groups" ON groups;
CREATE POLICY "anon_update_groups" ON groups FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_groups" ON groups;
CREATE POLICY "anon_delete_groups" ON groups FOR DELETE TO anon, authenticated USING (true);

-- 4. Topics
CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  topic_id text,
  title text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  total_episodes int DEFAULT 0,
  downloaded_episodes int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_topics" ON topics;
CREATE POLICY "anon_read_topics" ON topics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_topics" ON topics;
CREATE POLICY "anon_insert_topics" ON topics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_topics" ON topics;
CREATE POLICY "anon_update_topics" ON topics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_topics" ON topics;
CREATE POLICY "anon_delete_topics" ON topics FOR DELETE TO anon, authenticated USING (true);

-- 5. Episodes
CREATE TABLE IF NOT EXISTS episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES topics(id) ON DELETE SET NULL,
  message_id text,
  ep_number int,
  title text,
  file_name text,
  file_size bigint DEFAULT 0,
  duration int DEFAULT 0,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'pending',
  r2_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_episodes" ON episodes;
CREATE POLICY "anon_read_episodes" ON episodes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_episodes" ON episodes;
CREATE POLICY "anon_insert_episodes" ON episodes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_episodes" ON episodes;
CREATE POLICY "anon_update_episodes" ON episodes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_episodes" ON episodes;
CREATE POLICY "anon_delete_episodes" ON episodes FOR DELETE TO anon, authenticated USING (true);

-- 6. Downloads (Job Queue)
CREATE TABLE IF NOT EXISTS downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0,
  speed_mbps numeric DEFAULT 0,
  downloaded_bytes bigint DEFAULT 0,
  total_bytes bigint DEFAULT 0,
  r2_key text,
  r2_url text,
  error text,
  queued_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_downloads" ON downloads;
CREATE POLICY "anon_read_downloads" ON downloads FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_downloads" ON downloads;
CREATE POLICY "anon_insert_downloads" ON downloads FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_downloads" ON downloads;
CREATE POLICY "anon_update_downloads" ON downloads FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_downloads" ON downloads;
CREATE POLICY "anon_delete_downloads" ON downloads FOR DELETE TO anon, authenticated USING (true);

-- 7. URL Lists
CREATE TABLE IF NOT EXISTS url_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  color text DEFAULT 'blue',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE url_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_url_lists" ON url_lists;
CREATE POLICY "anon_read_url_lists" ON url_lists FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_url_lists" ON url_lists;
CREATE POLICY "anon_insert_url_lists" ON url_lists FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_url_lists" ON url_lists;
CREATE POLICY "anon_update_url_lists" ON url_lists FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_url_lists" ON url_lists;
CREATE POLICY "anon_delete_url_lists" ON url_lists FOR DELETE TO anon, authenticated USING (true);

-- 8. URL List Items
CREATE TABLE IF NOT EXISTS url_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_list_id uuid NOT NULL REFERENCES url_lists(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  episode_number int,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE url_list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_url_items" ON url_list_items;
CREATE POLICY "anon_read_url_items" ON url_list_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_url_items" ON url_list_items;
CREATE POLICY "anon_insert_url_items" ON url_list_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_url_items" ON url_list_items;
CREATE POLICY "anon_update_url_items" ON url_list_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_url_items" ON url_list_items;
CREATE POLICY "anon_delete_url_items" ON url_list_items FOR DELETE TO anon, authenticated USING (true);

-- 9. Auto Download Rules
CREATE TABLE IF NOT EXISTS auto_download_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES topics(id) ON DELETE CASCADE,
  auto_ep_start int,
  auto_ep_end int,
  quality_filter text,
  min_file_size_mb int DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  last_check_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE auto_download_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_auto_rules" ON auto_download_rules;
CREATE POLICY "anon_read_auto_rules" ON auto_download_rules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_auto_rules" ON auto_download_rules;
CREATE POLICY "anon_insert_auto_rules" ON auto_download_rules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_auto_rules" ON auto_download_rules;
CREATE POLICY "anon_update_auto_rules" ON auto_download_rules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_auto_rules" ON auto_download_rules;
CREATE POLICY "anon_delete_auto_rules" ON auto_download_rules FOR DELETE TO anon, authenticated USING (true);

-- 10. Download Settings
CREATE TABLE IF NOT EXISTS download_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concurrent_downloads int NOT NULL DEFAULT 3,
  speed_limit_mbps int DEFAULT 0,
  auto_start boolean NOT NULL DEFAULT true,
  quality_pref text DEFAULT 'highest',
  notify_on_complete boolean NOT NULL DEFAULT true,
  retry_on_fail boolean NOT NULL DEFAULT true,
  max_retries int DEFAULT 3,
  r2_folder_pattern text DEFAULT '{group}/{topic}/EP{ep}',
  auto_r2_upload boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE download_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_dl_settings" ON download_settings;
CREATE POLICY "anon_read_dl_settings" ON download_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_dl_settings" ON download_settings;
CREATE POLICY "anon_insert_dl_settings" ON download_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_dl_settings" ON download_settings;
CREATE POLICY "anon_update_dl_settings" ON download_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_dl_settings" ON download_settings;
CREATE POLICY "anon_delete_dl_settings" ON download_settings FOR DELETE TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_episodes_group_id ON episodes(group_id);
CREATE INDEX IF NOT EXISTS idx_episodes_topic_id ON episodes(topic_id);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_episode_id ON downloads(episode_id);
CREATE INDEX IF NOT EXISTS idx_topics_group_id ON topics(group_id);
CREATE INDEX IF NOT EXISTS idx_url_items_list_id ON url_list_items(url_list_id);
CREATE INDEX IF NOT EXISTS idx_auto_rules_group_id ON auto_download_rules(group_id);
