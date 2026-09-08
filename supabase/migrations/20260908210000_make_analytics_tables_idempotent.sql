-- The admin page is reported "stuck" (not just erroring) since the last
-- fix — a plausible explanation this migration guards against: if the
-- ORIGINAL migration (20260908063609) wasn't actually run as one atomic
-- transaction by whatever runs migrations in this deployment (i.e. some of
-- its CREATE TABLEs survived even though the bundled storage.buckets
-- INSERT at the end failed), then the RETRY migration
-- (20260908190000, plain `CREATE TABLE`, no `IF NOT EXISTS`) would itself
-- have failed with "relation already exists" — which could leave the
-- whole migration pipeline stuck retrying/blocked on this file, holding up
-- everything after it. This migration re-does the same three tables +
-- indexes + policies, but every statement is written to succeed whether or
-- not it already exists, so it can never fail this way regardless of
-- whatever partial state came before it — the safe, idempotent version
-- of 20260908190000, not a third guess at the real cause.

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id uuid PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  entry_path text,
  referrer text,
  source text NOT NULL DEFAULT 'direct',
  user_agent text
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('pageview', 'click')),
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_type_path_idx ON public.analytics_events (type, path);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON public.analytics_events (created_at);

CREATE TABLE IF NOT EXISTS public.collage_creations (
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
CREATE INDEX IF NOT EXISTS collage_creations_created_at_idx ON public.collage_creations (created_at);

GRANT ALL ON public.analytics_sessions TO service_role;
GRANT ALL ON public.analytics_events TO service_role;
GRANT ALL ON public.collage_creations TO service_role;

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collage_creations ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY has no IF NOT EXISTS in Postgres — drop-then-create is the
-- standard idempotent pattern instead.
DROP POLICY IF EXISTS "analytics_sessions_admin_select" ON public.analytics_sessions;
CREATE POLICY "analytics_sessions_admin_select" ON public.analytics_sessions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "analytics_events_admin_select" ON public.analytics_events;
CREATE POLICY "analytics_events_admin_select" ON public.analytics_events FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "collage_creations_admin_select" ON public.collage_creations;
CREATE POLICY "collage_creations_admin_select" ON public.collage_creations FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Same idempotent treatment for the storage bucket (see
-- 20260908190001_add_collages_storage_bucket.sql) — already had
-- ON CONFLICT DO NOTHING, so it's already safe to re-run; repeated here
-- for completeness in case that specific migration is what's stuck.
INSERT INTO storage.buckets (id, name, public)
VALUES ('collages', 'collages', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
