/*
  # Restrict trigger-only functions from direct RPC calls

  handle_new_user_profile() and enforce_download_quota() are SECURITY
  DEFINER functions meant to run only as triggers (AFTER INSERT ON
  auth.users / BEFORE INSERT ON downloads). Postgres grants EXECUTE on new
  functions to PUBLIC by default, which the Supabase security advisor
  flagged: either function could be called directly via
  /rest/v1/rpc/<name> by anon or authenticated. Revoking EXECUTE closes
  that off without affecting the triggers themselves, which run with the
  function owner's privileges regardless of grants.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_download_quota() FROM PUBLIC, anon, authenticated;
