/*
  # Save URL-list items into R2

  The URL Lists page could collect links, but "download" only flipped a status
  column: nothing fetched the URL and nothing recorded where it went. These
  columns give the service somewhere to put the result, so a list can be saved
  into the bucket and the public URL read straight back out of the row.

  1. Changes to `url_list_items`
    - `r2_key` (text)      — object key in the bucket once saved
    - `r2_url` (text)      — public URL, null when no public URL is configured
    - `file_size` (bigint) — bytes, as reported by the source server
    - `error` (text)       — why the last attempt failed
    - `updated_at` (timestamptz) — touched on every status change
    - `status` gains `queued`, alongside pending/downloading/completed/failed

  2. Security
    - No policy changes: the table's existing RLS still applies, and the
      service writes with the service-role key as it does everywhere else.
*/

ALTER TABLE url_list_items ADD COLUMN IF NOT EXISTS r2_key text;
ALTER TABLE url_list_items ADD COLUMN IF NOT EXISTS r2_url text;
ALTER TABLE url_list_items ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE url_list_items ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE url_list_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'url_list_items'::regclass AND conname = 'url_list_items_status_check'
  ) THEN
    ALTER TABLE url_list_items DROP CONSTRAINT url_list_items_status_check;
  END IF;
END $$;

ALTER TABLE url_list_items
  ADD CONSTRAINT url_list_items_status_check
  CHECK (status IN ('pending', 'queued', 'downloading', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS url_list_items_status_idx ON url_list_items (status);
