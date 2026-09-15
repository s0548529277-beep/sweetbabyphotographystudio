-- Same "Could not find the table ... in the schema cache" issue seen
-- earlier (20260908220000, 20260909100000), now for the brand-new
-- newborn_order_images table (20260915063000). NOTIFY alone was already
-- shown to be unreliable on this project's PostgREST connection last time
-- (didn't pick up for almost a day) — going straight to the stronger,
-- documented fix instead of repeating that wait: terminate PostgREST's
-- existing DB connection so it's forced to reconnect and rebuild its
-- schema cache from scratch.
DO $$
BEGIN
  PERFORM pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE lower(application_name) = 'postgrest' AND pid <> pg_backend_pid();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pg_terminate_backend on postgrest connections skipped: insufficient privilege';
END $$;

NOTIFY pgrst, 'reload schema';
