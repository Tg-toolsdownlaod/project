/*
  # Telegram Login identities

  Maps a Telegram account (from the Login Widget) to the Supabase Auth user
  it's signed in as. Written only by the backend service (service-role key,
  bypasses RLS) when a visitor signs in with Telegram for the first time;
  read by nothing client-side today, but RLS is still enabled and scoped so
  a signed-in subscriber could read their own row if a future screen needs
  to show "connected as @username".
*/

CREATE TABLE IF NOT EXISTS telegram_identities (
  telegram_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_identities_user_id_idx ON telegram_identities(user_id);

ALTER TABLE telegram_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_telegram_identity"
  ON telegram_identities FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
