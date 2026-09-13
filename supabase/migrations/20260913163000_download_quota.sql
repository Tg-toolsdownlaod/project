/*
  # Basic-tier download quota

  Enforces pricing_tiers.monthly_quota without touching the `downloads`
  table's own columns (no user_id there -- that's the separate, not-yet-built
  multi-tenant isolation phase). Instead this tracks *how many times a
  subscriber has asked to queue a download* in a small side table, checked
  and incremented by a trigger on the exact insert GroupsPage.tsx already
  does client-side (`supabase.from('downloads').insert(...)`) -- so the
  existing queueing flow needs no code change at all.

  Only fires for a request carrying a real subscriber session (auth.uid()
  is set): a service-role insert (e.g. the backend's own auto-download-rule
  worker) has no per-user identity to charge the quota to under today's
  single shared `downloads` table, so it is intentionally left unmetered
  until that same multi-tenant work lands.
*/

CREATE TABLE IF NOT EXISTS download_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year_month)
);

ALTER TABLE download_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_usage" ON download_usage;
CREATE POLICY "users_read_own_usage" ON download_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No client write policy: only the trigger function below (SECURITY DEFINER)
-- ever changes a count, so a subscriber can't reset their own usage.

CREATE OR REPLACE FUNCTION public.enforce_download_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  sub_tier text;
  quota integer;
  active boolean;
  ym text := to_char(now(), 'YYYY-MM');
  used integer;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW; -- service-role / backend-initiated insert, see comment above
  END IF;

  SELECT s.tier, (s.expires_at > now()) INTO sub_tier, active
  FROM subscriptions s WHERE s.user_id = uid;

  IF sub_tier IS NULL OR active IS NOT TRUE THEN
    RAISE EXCEPTION 'No active subscription.';
  END IF;

  SELECT p.monthly_quota INTO quota FROM pricing_tiers p WHERE p.key = sub_tier;

  IF quota IS NULL THEN
    RETURN NEW; -- unlimited (Pro), or the tier itself has no cap
  END IF;

  INSERT INTO download_usage (user_id, year_month, count)
  VALUES (uid, ym, 0)
  ON CONFLICT (user_id, year_month) DO NOTHING;

  SELECT count INTO used FROM download_usage WHERE user_id = uid AND year_month = ym FOR UPDATE;

  IF used >= quota THEN
    RAISE EXCEPTION 'Monthly download quota reached (% of %).', used, quota;
  END IF;

  UPDATE download_usage SET count = count + 1 WHERE user_id = uid AND year_month = ym;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_download_quota_trigger ON downloads;
CREATE TRIGGER enforce_download_quota_trigger
  BEFORE INSERT ON downloads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_download_quota();
