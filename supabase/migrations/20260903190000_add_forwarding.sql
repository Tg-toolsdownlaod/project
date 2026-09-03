/*
# Forwarding videos from a topic into another Telegram group

## Overview
Adds the tables needed to forward episodes that live inside a group/topic
into a different Telegram group, identified only by its chat ID. The
operator picks episodes in the UI (or a whole topic), enters the
destination group ID, and a forward job is created. A worker picks the job
up, forwards each message, and reports progress back into these tables.

## New Tables
1. `forward_targets` — reusable destination groups (chat_id, title, username,
   is_forum, verified, last_used_at). Saved so the operator does not have to
   retype a group ID every time.
2. `forward_jobs` — one forwarding run (source group/topic, destination chat,
   optional destination topic, mode, counters, status, auto_follow).
3. `forward_job_items` — one row per episode inside a job, so progress and
   per-episode errors are visible.

## Changes to existing tables
- `auto_download_rules` gains `forward_to_chat_id`, `forward_to_topic_id` and
  `forward_enabled` so a rule can also auto-forward new episodes to another
  group as soon as they are detected.

## Security
- Single-tenant app with no login screen, same as the rest of the schema.
- RLS enabled on all new tables.
- Policies use `TO anon, authenticated` so the anon-key frontend can read/write.

## Notes
1. Forward job status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
2. Forward item status: 'pending' | 'forwarded' | 'failed' | 'skipped'
3. `mode` is 'selected' (explicit episode picks) or 'topic' (everything in a topic).
4. `auto_follow` keeps the job alive so newly scanned episodes are forwarded too.
*/

-- 1. Forward Targets (saved destination groups)
CREATE TABLE IF NOT EXISTS forward_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  username text,
  is_forum boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forward_targets_chat_id ON forward_targets(chat_id);

ALTER TABLE forward_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_forward_targets" ON forward_targets;
CREATE POLICY "anon_read_forward_targets" ON forward_targets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_forward_targets" ON forward_targets;
CREATE POLICY "anon_insert_forward_targets" ON forward_targets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_forward_targets" ON forward_targets;
CREATE POLICY "anon_update_forward_targets" ON forward_targets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_forward_targets" ON forward_targets;
CREATE POLICY "anon_delete_forward_targets" ON forward_targets FOR DELETE TO anon, authenticated USING (true);

-- 2. Forward Jobs
CREATE TABLE IF NOT EXISTS forward_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  source_topic_id uuid REFERENCES topics(id) ON DELETE SET NULL,
  target_chat_id text NOT NULL,
  target_title text,
  target_topic_id text,
  mode text NOT NULL DEFAULT 'selected',
  status text NOT NULL DEFAULT 'queued',
  total_count int NOT NULL DEFAULT 0,
  forwarded_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  auto_follow boolean NOT NULL DEFAULT false,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE forward_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_forward_jobs" ON forward_jobs;
CREATE POLICY "anon_read_forward_jobs" ON forward_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_forward_jobs" ON forward_jobs;
CREATE POLICY "anon_insert_forward_jobs" ON forward_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_forward_jobs" ON forward_jobs;
CREATE POLICY "anon_update_forward_jobs" ON forward_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_forward_jobs" ON forward_jobs;
CREATE POLICY "anon_delete_forward_jobs" ON forward_jobs FOR DELETE TO anon, authenticated USING (true);

-- 3. Forward Job Items
CREATE TABLE IF NOT EXISTS forward_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES forward_jobs(id) ON DELETE CASCADE,
  episode_id uuid REFERENCES episodes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  forwarded_message_id text,
  error text,
  forwarded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE forward_job_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_forward_items" ON forward_job_items;
CREATE POLICY "anon_read_forward_items" ON forward_job_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_forward_items" ON forward_job_items;
CREATE POLICY "anon_insert_forward_items" ON forward_job_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_forward_items" ON forward_job_items;
CREATE POLICY "anon_update_forward_items" ON forward_job_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_forward_items" ON forward_job_items;
CREATE POLICY "anon_delete_forward_items" ON forward_job_items FOR DELETE TO anon, authenticated USING (true);

-- 4. Auto-forward columns on auto_download_rules
ALTER TABLE auto_download_rules
  ADD COLUMN IF NOT EXISTS forward_to_chat_id text,
  ADD COLUMN IF NOT EXISTS forward_to_topic_id text,
  ADD COLUMN IF NOT EXISTS forward_enabled boolean NOT NULL DEFAULT false;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_forward_jobs_status ON forward_jobs(status);
CREATE INDEX IF NOT EXISTS idx_forward_jobs_source_group ON forward_jobs(source_group_id);
CREATE INDEX IF NOT EXISTS idx_forward_jobs_source_topic ON forward_jobs(source_topic_id);
CREATE INDEX IF NOT EXISTS idx_forward_items_job_id ON forward_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_forward_items_episode_id ON forward_job_items(episode_id);
