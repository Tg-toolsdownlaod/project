/*
  # Episodes: audio ("song") support

  Until now the scanner only ever recognized video documents, so audio files
  sitting in a group (music, voice notes) were invisible to it. Adding
  media_type lets the UI tell a song apart from a video in the list; mime_type
  is threaded through to the R2 upload so a song doesn't get uploaded with a
  video content-type. Both are additive and backfill existing rows as 'video'
  (everything scanned so far was, by definition, video-only).
*/

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'video';
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS mime_type text;
