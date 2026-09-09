REVOKE EXECUTE ON FUNCTION public.reload_pgrst_schema() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.reload_pgrst_schema() TO service_role;