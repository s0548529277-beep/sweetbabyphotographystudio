-- The "Could not find the table ... in the schema cache" error has now
-- persisted for close to a day across several NOTIFY-based attempts
-- (20260908063609, 20260908190000, 20260908213000, 20260908220000's RPC)
-- — long enough that this isn't a debounce/timing issue, it's PostgREST's
-- LISTEN connection itself not picking up any of them. This is a real,
-- documented failure mode (see PostgREST/postgrest#2791 and Supabase's own
-- troubleshooting docs) — and Supabase customer support's own documented
-- workaround for exactly this ("PGRST205 cache doesn't update after
-- NOTIFY") is more forceful than another NOTIFY: terminate PostgREST's
-- existing database connection so it's forced to reconnect and rebuild its
-- schema cache from scratch on the new connection, rather than relying on
-- a LISTEN channel that may have silently stopped delivering.
DO $$
BEGIN
  PERFORM pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE lower(application_name) = 'postgrest' AND pid <> pg_backend_pid();
EXCEPTION WHEN insufficient_privilege THEN
  -- If the role running migrations here can't signal other backends,
  -- fail soft rather than blocking every table/index statement in the
  -- rest of this migration batch on a permissions error for a
  -- best-effort recovery step.
  RAISE NOTICE 'pg_terminate_backend on postgrest connections skipped: insufficient privilege';
END $$;

NOTIFY pgrst, 'reload schema';
