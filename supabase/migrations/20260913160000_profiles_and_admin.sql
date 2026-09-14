/*
  # Profiles + admin flag

  One row per Supabase Auth user, auto-created on signup, holding the one
  thing the rest of the subscription system needs to know beyond identity:
  whether this account is the operator (can approve payments, edit pricing).
  Mirrors the proven profiles.is_admin pattern from the reference project
  this was ported from -- every admin-only RLS policy from here on checks
  this same table.

  After running this, bootstrap the operator's own account once:
    update profiles set is_admin = true
    where id = (select id from auth.users where email = 'hengheng01220@gmail.com');
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;
CREATE POLICY "admin_read_all_profiles" ON profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- Nobody writes is_admin from the client -- only the backend's service-role
-- key (which bypasses RLS) or the operator running SQL by hand ever should.

-- Every new Supabase Auth user gets a profile row automatically, so the
-- subscription gate and admin check always have something to read.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill anyone who signed up before this migration existed.
INSERT INTO profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;
