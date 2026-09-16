/*
# Fix profiles admin policy recursion

1. Purpose
- Remove the self-referencing profiles SELECT policy that caused Supabase to stop all profile reads with an "infinite recursion detected" error.
- Keep the safe own-profile policy so a signed-in user can read their own admin flag.

2. Security
- The removed policy attempted to inspect profiles while deciding whether profiles could be read, which recursively invoked itself.
- Admin-only access to payment and pricing records continues to check the caller's own profiles row through the existing policies.
- No columns, rows, or user data are deleted or changed.

3. Important notes
- The operator's existing is_admin=true value remains unchanged.
- Admin access is re-evaluated from the caller's own session and profile row.
*/

DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;