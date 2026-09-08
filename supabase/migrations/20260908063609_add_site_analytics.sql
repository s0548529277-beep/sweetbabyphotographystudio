-- Lightweight, self-hosted site analytics for /admin/analytics — traffic
-- source, session duration, per-page click counts, and a gallery of the
-- collages visitors made on /collage-maker. Deliberately NOT Google
-- Analytics: the owner was asked and chose an in-house Supabase-backed
-- system over connecting a real GA4 property + service-account API
-- credentials, since it needs no external Google setup and shows up in
-- /admin immediately. All writes happen via server functions using the
-- service-role client (analytics.functions.ts) — visitors never get direct
-- table access, so there is no public INSERT policy on any of these
-- tables, only an admin-only SELECT policy for the admin page itself.

-- One row per browser session (client-generated uuid, kept in
-- sessionStorage — see src/lib/site-tracking.tsx). first_seen/last_seen
-- bracket the visit; last_seen is nudged forward by every pageview, click
-- batch, and periodic heartbeat while the tab is open, so
-- (last_seen - first_seen) is a real "time on site", not just a guess from
-- the first and last page load.
CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  entry_path text,
  referrer text,
  -- Coarse bucket parsed once from referrer/UTM at session start (see
  -- classifyTrafficSource in analytics.functions.ts) — "google", "meta"
  -- (facebook/instagram), "whatsapp", "direct", "other" — kept as its own
  -- column so the admin summary can just GROUP BY it instead of
  -- re-parsing every raw referrer on every read.
  source text NOT NULL DEFAULT 'direct',
  user_agent text
);

-- One row per pageview or click. Click rows don't need a target/label —
-- "how many clicks happened on each page" only needs the path, per the
-- owner's own framing of this feature.
CREATE TABLE public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('pageview', 'click')),
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_type_path_idx ON public.analytics_events (type, path);
CREATE INDEX analytics_events_created_at_idx ON public.analytics_events (created_at);

-- One row per finished, downloaded collage from the free public
-- /collage-maker tool. That tool was deliberately fully client-side before
-- this (no photo ever left the browser) — this adds an opt-in-by-use
-- upload of just the FINAL flattened PNG (not the original source photos
-- as separate files) purely so the owner can see what people are making,
-- per her own request. storage_path points into the private "collages"
-- bucket below; the admin page reads it via a signed URL, never a public one.
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

-- Private bucket for the flattened collage PNGs described above — never
-- public; every read goes through a short-lived signed URL minted
-- server-side for an already-verified admin (see getAnalyticsSummary).
INSERT INTO storage.buckets (id, name, public)
VALUES ('collages', 'collages', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
