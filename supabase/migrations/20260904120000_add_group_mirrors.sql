/*
# Mirroring a whole group into a new one

## Overview
Copying a large forum group into a fresh "branch" group is not one forward
job: each source topic needs its own topic in the destination, and each needs
its own run with its own progress. This adds the parent record that ties those
runs together, and the per-topic mapping so a re-run does not create duplicate
topics.

It also records HOW each copy should be made. A group with Telegram's content
protection turned on cannot be forwarded from at all — the only way to copy it
is to download each video and upload it again as a new file. That is slower and
uses bandwidth, so it is a choice, not a default.

## New Tables
1. `group_mirrors` — one mirror of a source group into a destination chat
   (source_group_id, target_chat_id, create_topics, copy_mode, auto_follow,
   status, counters).
2. `mirror_topic_map` — source topic -> destination topic id, so a re-run
   reuses the topic it created last time instead of making another one.

## Changes to existing tables
- `forward_jobs` gains `mirror_id` (the mirror that spawned it, when any) and
  `copy_mode`, so the worker knows whether to forward or re-upload.

## Security
- Single-tenant app with no login screen, same as the rest of the schema.
- RLS enabled on both new tables with the usual anon+authenticated policies.

## Notes
1. Mirror status: 'draft' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled'
2. copy_mode: 'auto' (forward, fall back to re-upload when Telegram refuses)
   | 'forward' (forward only) | 'reupload' (always download and send fresh)
*/

-- 1. Group mirrors
CREATE TABLE IF NOT EXISTS group_mirrors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  target_chat_id text NOT NULL,
  target_title text,
  create_topics boolean NOT NULL DEFAULT true,
  copy_mode text NOT NULL DEFAULT 'auto',
  auto_follow boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  total_topics int NOT NULL DEFAULT 0,
  total_videos int NOT NULL DEFAULT 0,
  error text,
  prepared_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE group_mirrors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_group_mirrors" ON group_mirrors;
CREATE POLICY "anon_read_group_mirrors" ON group_mirrors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_group_mirrors" ON group_mirrors;
CREATE POLICY "anon_insert_group_mirrors" ON group_mirrors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_group_mirrors" ON group_mirrors;
CREATE POLICY "anon_update_group_mirrors" ON group_mirrors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_group_mirrors" ON group_mirrors;
CREATE POLICY "anon_delete_group_mirrors" ON group_mirrors FOR DELETE TO anon, authenticated USING (true);

-- 2. Source topic -> destination topic
CREATE TABLE IF NOT EXISTS mirror_topic_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mirror_id uuid NOT NULL REFERENCES group_mirrors(id) ON DELETE CASCADE,
  source_topic_id uuid REFERENCES topics(id) ON DELETE CASCADE,
  target_topic_id text,
  title text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- One row per source topic per mirror; a NULL source topic is the
-- "videos outside any topic" bucket, which also occurs at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mirror_topic_map_unique
  ON mirror_topic_map(mirror_id, source_topic_id)
  WHERE source_topic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mirror_topic_map_general
  ON mirror_topic_map(mirror_id)
  WHERE source_topic_id IS NULL;

ALTER TABLE mirror_topic_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_mirror_topics" ON mirror_topic_map;
CREATE POLICY "anon_read_mirror_topics" ON mirror_topic_map FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_mirror_topics" ON mirror_topic_map;
CREATE POLICY "anon_insert_mirror_topics" ON mirror_topic_map FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_mirror_topics" ON mirror_topic_map;
CREATE POLICY "anon_update_mirror_topics" ON mirror_topic_map FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_mirror_topics" ON mirror_topic_map;
CREATE POLICY "anon_delete_mirror_topics" ON mirror_topic_map FOR DELETE TO anon, authenticated USING (true);

-- 3. Link forward jobs back to their mirror, and record how to copy
ALTER TABLE forward_jobs
  ADD COLUMN IF NOT EXISTS mirror_id uuid REFERENCES group_mirrors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS copy_mode text NOT NULL DEFAULT 'auto';

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_group_mirrors_source ON group_mirrors(source_group_id);
CREATE INDEX IF NOT EXISTS idx_group_mirrors_status ON group_mirrors(status);
CREATE INDEX IF NOT EXISTS idx_mirror_topic_map_mirror ON mirror_topic_map(mirror_id);
CREATE INDEX IF NOT EXISTS idx_forward_jobs_mirror ON forward_jobs(mirror_id);
