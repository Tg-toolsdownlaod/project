/*
  # Multi-tenant: add owner column (Phase 2a of 2)

  Every table gets a `user_id` column so each subscriber's data can
  eventually be told apart from everyone else's -- the first half of
  turning this from a single-operator tool into a per-subscriber one.

  This half is intentionally non-breaking: the column is added as
  NULLABLE with `DEFAULT auth.uid()`, and every existing RLS policy is
  left exactly as it is (open to `anon, authenticated`). The backend
  service still writes with the service-role key and does not yet pass
  a user_id on every insert -- that lands with Phase 3 -- so nothing
  about how it reads or writes today changes.

  Existing rows are backfilled to the operator's own account, detected
  automatically as "the only row in auth.users" (see the DO block
  below). If that assumption doesn't hold -- no account yet, or more
  than one -- the migration stops with a clear error instead of
  guessing which account should own everything.

  Phase 2b -- making the column NOT NULL, dropping `anon` from every
  policy, and scoping each one to `user_id = auth.uid()` -- is a
  separate migration that must not run until the backend has been
  redeployed to pass user_id explicitly on every write it makes (Phase
  3). Running 2b before that would start rejecting the backend's own
  inserts and hide its rows from the UI.
*/

DO $$
DECLARE
  operator_id uuid;
  user_count int;
  tbl text;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 0 THEN
    RAISE EXCEPTION 'No account exists yet. Sign up on the app first (email+password or "Log in with Telegram"), then re-run this migration.';
  ELSIF user_count > 1 THEN
    RAISE EXCEPTION 'More than one account exists (%). Edit this migration to set operator_id := ''<your auth.users.id>''::uuid directly instead of auto-detecting it, then re-run.', user_count;
  END IF;

  SELECT id INTO operator_id FROM auth.users LIMIT 1;
  RAISE NOTICE 'Backfilling existing rows to account %', operator_id;

  FOREACH tbl IN ARRAY ARRAY[
    'telegram_settings', 'r2_settings', 'groups', 'topics', 'episodes',
    'downloads', 'url_lists', 'url_list_items', 'auto_download_rules',
    'download_settings', 'forward_targets', 'forward_jobs',
    'forward_job_items', 'group_mirrors', 'mirror_topic_map'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE',
      tbl
    );
    EXECUTE format('UPDATE %I SET user_id = %L WHERE user_id IS NULL', tbl, operator_id);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(user_id)', tbl || '_user_id_idx', tbl);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Subscriptions: a brand new table, so -- unlike the ones above -- it
-- can be scoped correctly from day one. Nothing writes to it yet; that
-- lands with Phase 4's admin screen.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  current_period_end timestamptz,
  payment_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- A subscriber can see their own plan/status. Writing is left to the
-- backend's service-role key (Phase 4's admin screen), which bypasses
-- RLS entirely, so no INSERT/UPDATE/DELETE policy is defined here.
CREATE POLICY "owner_read_subscription"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
