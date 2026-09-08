-- Isolated on purpose (see 20260908190000's own doc comment): this exact
-- statement, bundled together with the analytics table creation, is the
-- most likely reason that whole earlier migration silently rolled back —
-- storage.buckets is owned by supabase_storage_admin, and a raw INSERT
-- into it from a migration role can fail with a permission error in some
-- Supabase project configurations. Kept in its own file/transaction now:
-- if this one statement still fails, only collage-image saving on
-- /collage-maker degrades (it already fails silently, best-effort, by
-- design — see saveCollageCreation's own fallback in analytics.functions.ts,
-- which additionally now retries via the Storage API's own createBucket
-- call if this row still isn't there) — it can never again take the
-- session/pageview/click tables down with it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('collages', 'collages', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
