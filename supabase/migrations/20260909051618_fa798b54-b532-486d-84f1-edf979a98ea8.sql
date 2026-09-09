CREATE TABLE public.analytics_sessions (
  id uuid NOT NULL PRIMARY KEY,
  entry_path text,
  referrer text,
  source text NOT NULL DEFAULT 'direct',
  user_agent text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.analytics_sessions TO service_role;
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.analytics_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  type text NOT NULL,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.collage_creations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid,
  storage_path text NOT NULL,
  format_id text,
  size_id text,
  style_id text,
  photo_count integer,
  caption text,
  subtitle text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.collage_creations TO service_role;
ALTER TABLE public.collage_creations ENABLE ROW LEVEL SECURITY;

CREATE INDEX analytics_events_session_idx ON public.analytics_events(session_id);
CREATE INDEX analytics_events_created_idx ON public.analytics_events(created_at);
CREATE INDEX analytics_sessions_first_seen_idx ON public.analytics_sessions(first_seen);
CREATE INDEX collage_creations_created_idx ON public.collage_creations(created_at);

CREATE OR REPLACE FUNCTION public.reload_pgrst_schema()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pg_notify('pgrst', 'reload schema');
$$;