-- Re-does the CREATE TABLEs from 20260908063609_add_site_analytics.sql,
-- which never actually took: comparing the regenerated Supabase types
-- after that migration's deploy showed none of analytics_sessions/
-- analytics_events/collage_creations exist, breaking /admin/analytics
-- ("שגיאה בטעינת הנתונים") and the tracking calls (silently, after a
-- separate fix wrapped them in try/catch). Root cause: that migration
-- bundled `INSERT INTO storage.buckets` in the SAME file as the CREATE
-- TABLEs — Postgres runs a migration as one transaction, and storage.buckets
-- is owned by supabase_storage_admin, not whatever role runs migrations
-- here, so that one INSERT most likely errored and rolled back everything
-- else in the file along with it. This migration is IDENTICAL to that
-- file's table/index/RLS statements, just without the bucket insert riding
-- along — see 20260908190001_add_collages_storage_bucket.sql for that,
-- now isolated so its own failure (if it fails again) can never take these
-- tables down with it. The old migration file is left in place rather than
-- edited or deleted — this repo's migrations are append-only history.

CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  entry_path text,
  referrer text,
  source text NOT NULL DEFAULT 'direct',
  user_agent text
);

CREATE TABLE public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('pageview', 'click')),
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_type_path_idx ON public.analytics_events (type, path);
CREATE INDEX analytics_events_created_at_idx ON public.analytics_events (created_at);

CREATE TABLE public.collage_creations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.analytics_sessions(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  format_id text,
  size_id text,
  style_id text,
  photo_count integer,
  caption text,
  subtitle text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collage_creations_created_at_idx ON public.collage_creations (created_at);

GRANT ALL ON public.analytics_sessions TO service_role;
GRANT ALL ON public.analytics_events TO service_role;
GRANT ALL ON public.collage_creations TO service_role;

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collage_creations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_sessions_admin_select" ON public.analytics_sessions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "analytics_events_admin_select" ON public.analytics_events FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "collage_creations_admin_select" ON public.collage_creations FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
