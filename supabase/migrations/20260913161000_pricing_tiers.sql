/*
  # Pricing tiers (admin-editable)

  One row per plan the picker offers. Ported from the reference project's
  pricing_tiers table, with two additions this app needs that the reference
  didn't: `capability` (which feature set the tier unlocks -- 'basic' just
  uses the app's own shared userbot, 'pro' lets a subscriber connect their
  own Telegram account and their own storage) and `monthly_quota` (downloads
  per calendar month; null = unlimited). Price, labels, quota and capability
  are all editable from the Admin Panel with no code change, same as the
  reference project's design.
*/

CREATE TABLE IF NOT EXISTS pricing_tiers (
  key text PRIMARY KEY,
  capability text NOT NULL CHECK (capability IN ('basic', 'pro')),
  price numeric NOT NULL,
  months integer NOT NULL DEFAULT 1,
  monthly_quota integer,
  label_km text NOT NULL,
  label_en text NOT NULL,
  pitch_km text,
  pitch_en text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_pricing_tiers" ON pricing_tiers;
CREATE POLICY "public_read_pricing_tiers" ON pricing_tiers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_pricing_tiers" ON pricing_tiers;
CREATE POLICY "admin_write_pricing_tiers" ON pricing_tiers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

INSERT INTO pricing_tiers (key, capability, price, months, monthly_quota, label_km, label_en, pitch_km, pitch_en) VALUES
  ('basic_1m', 'basic', 5, 1, 30, 'មូលដ្ឋាន', 'Basic',
   'ប្រើ userbot របស់ app ផ្ទាល់ — មិនចាំបាច់ភ្ជាប់គណនី Telegram ខ្លួនឯង',
   'Use the app''s own shared userbot -- no Telegram account of your own to connect'),
  ('pro_1m', 'pro', 9, 1, NULL, 'Pro', 'Pro',
   'ភ្ជាប់គណនី Telegram ខ្លួនឯង + storage ខ្លួនឯង — ចូល VIP/private group ដែលអ្នកជាសមាជិក',
   'Connect your own Telegram account + your own storage -- reach VIP/private groups you''re a member of')
ON CONFLICT (key) DO NOTHING;
