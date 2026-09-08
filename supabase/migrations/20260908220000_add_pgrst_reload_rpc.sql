-- Self-healing follow-up to the "Could not find the table ... in the
-- schema cache" error: the owner has no Supabase dashboard access to
-- manually trigger a reload, and there's no way to know from here whether
-- the NOTIFY a migration sends actually reaches PostgREST in this
-- project's specific connection setup (pooled connections can prevent
-- LISTEN/NOTIFY from propagating at all — a real, common gotcha, not
-- confirmed as the cause here but plausible). This exposes the exact same
-- NOTIFY as a callable RPC, so the app itself can fire it from a live
-- request instead of only from a migration-time connection — a different
-- connection path that might succeed where the migration's own NOTIFY
-- didn't. See getAnalyticsSummary in analytics.functions.ts for the
-- self-healing retry that calls this.
CREATE OR REPLACE FUNCTION public.reload_pgrst_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reload_pgrst_schema() TO service_role;

NOTIFY pgrst, 'reload schema';
