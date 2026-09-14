/*
  # Subscriptions + payment review

  Ported from the reference project's subscription-payment-addition.sql,
  simplified by real identity: the reference had no login at all (every
  policy had to be `USING (true)` and read access was locked down through
  SECURITY DEFINER RPCs instead, keyed by a bare telegram_user_id param).
  This app already has Supabase Auth (Phase 1), so `user_id = auth.uid()`
  does the same job as a normal RLS policy -- no RPCs needed. Anything that
  changes a payment's status or grants time (a real money decision) goes
  through the backend's service-role client instead of a client-side
  update, which is what actually keeps a viewer from granting themselves
  VIP -- not the RPC wrapper the reference needed for a different reason.

  subscriptions       -- one row per user, current plan + expiry
  payment_submissions -- every payment claim (QR/manual or ABA-matched),
                         reviewed by the admin (Telegram bot buttons or the
                         Admin Panel)
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Snapshot, not a join: auth.users isn't reachable through the client's
  -- own RLS-scoped session, so the Admin Panel needs the email stored
  -- directly here to show who each row belongs to (same reasoning the
  -- reference project had for storing telegram_username on its rows).
  email text,
  tier text,
  capability text CHECK (capability IN ('basic', 'pro')),
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_subscription" ON subscriptions;
CREATE POLICY "users_read_own_subscription" ON subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_write_subscriptions" ON subscriptions;
CREATE POLICY "admin_write_subscriptions" ON subscriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
-- No INSERT/UPDATE policy for a plain authenticated user: only an admin (via
-- the Admin Panel) or the backend's service-role client (via approving a
-- payment) can ever move expires_at forward. The service-role key bypasses
-- RLS entirely, so the approve flow still works with no viewer-facing policy.

CREATE TABLE IF NOT EXISTS payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Snapshot for the Admin Panel to display -- see subscriptions.email.
  email text,
  tier text NOT NULL REFERENCES pricing_tiers(key),
  amount numeric NOT NULL,
  screenshot_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  aba_trx_id text,
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  admin_note text
);

CREATE INDEX IF NOT EXISTS payment_submissions_user_id_idx ON payment_submissions(user_id);

ALTER TABLE payment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_submissions" ON payment_submissions;
CREATE POLICY "users_read_own_submissions" ON payment_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_submission" ON payment_submissions;
CREATE POLICY "users_insert_own_submission" ON payment_submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND email = (auth.jwt() ->> 'email')
    AND status = 'pending'
    AND amount = (SELECT price FROM pricing_tiers WHERE key = tier)
  );
-- A viewer can create a pending claim for themselves at the tier's real
-- price, and read their own claims, but cannot approve/reject one or attach
-- a screenshot to it directly (see attach-screenshot below) -- those go
-- through the backend so a Telegram notification/expiry check always fires
-- alongside the write instead of maybe getting skipped.

DROP POLICY IF EXISTS "admin_read_all_submissions" ON payment_submissions;
CREATE POLICY "admin_read_all_submissions" ON payment_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "admin_update_submissions" ON payment_submissions;
CREATE POLICY "admin_update_submissions" ON payment_submissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Storage bucket for payment screenshots, one folder per user.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_payment_proofs" ON storage.objects;
CREATE POLICY "public_read_payment_proofs" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "users_upload_own_payment_proof" ON storage.objects;
CREATE POLICY "users_upload_own_payment_proof" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admin-editable QR image (+ optional decoded KHQR string / pay link) per
-- tier, so the operator can change their bank QR without a code deploy.
CREATE TABLE IF NOT EXISTS payment_qr_codes (
  tier text PRIMARY KEY REFERENCES pricing_tiers(key),
  image_url text,
  khqr_string text,
  pay_link text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_qr_codes" ON payment_qr_codes;
CREATE POLICY "public_read_qr_codes" ON payment_qr_codes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_qr_codes" ON payment_qr_codes;
CREATE POLICY "admin_write_qr_codes" ON payment_qr_codes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-qr-codes', 'payment-qr-codes', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_qr_bucket" ON storage.objects;
CREATE POLICY "public_read_qr_bucket" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'payment-qr-codes');

DROP POLICY IF EXISTS "admin_write_qr_bucket" ON storage.objects;
CREATE POLICY "admin_write_qr_bucket" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'payment-qr-codes' AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (bucket_id = 'payment-qr-codes' AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
