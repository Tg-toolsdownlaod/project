/*
  # S3-compatible source storage settings

  A second, independent object store a subscriber can point at (e.g. an old
  Contabo/Backblaze/MinIO bucket) purely to browse it and, when ready, migrate
  its videos into their main R2 bucket. Mirrors r2_settings' shape and RLS
  pattern exactly -- same "one settings row" convention the backend's
  single()/upsertSingle() already expects.
*/

CREATE TABLE IF NOT EXISTS s3_source_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_url text,
  access_key_id text,
  secret_access_key text,
  bucket_name text,
  region text DEFAULT 'us-east-1',
  force_path_style boolean NOT NULL DEFAULT true,
  connected boolean NOT NULL DEFAULT false,
  last_connected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE s3_source_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_s3_source_settings" ON s3_source_settings;
CREATE POLICY "anon_read_s3_source_settings" ON s3_source_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_s3_source_settings" ON s3_source_settings;
CREATE POLICY "anon_insert_s3_source_settings" ON s3_source_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_s3_source_settings" ON s3_source_settings;
CREATE POLICY "anon_update_s3_source_settings" ON s3_source_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_s3_source_settings" ON s3_source_settings;
CREATE POLICY "anon_delete_s3_source_settings" ON s3_source_settings FOR DELETE TO anon, authenticated USING (true);
