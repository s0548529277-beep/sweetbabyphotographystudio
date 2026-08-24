-- "AI Photo Retouch" — a customer-facing feature: the admin defines a
-- preset by uploading a before/after example pair (e.g. "רזייה עדינה",
-- "ריטוש פנים"), and site visitors can then upload their own photo and get
-- it auto-edited in a similar style via the Lovable AI Gateway (Gemini's
-- image model). Presets are public read-only; only admins manage them,
-- through direct client calls guarded by RLS — same pattern as `items`.
CREATE TABLE public.retouch_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  -- Instruction sent to the AI model alongside the before/after example
  -- images, e.g. "רזייה עדינה של קו המותניים, בלי לשנות פרופורציות פנים".
  prompt text NOT NULL,
  before_path text NOT NULL,
  after_path text NOT NULL,
  -- Long-lived signed URLs (created at upload time, same as page_images) so
  -- both the public preset gallery and the retouch server function can read
  -- the example images straight from this row without re-signing.
  before_url text NOT NULL,
  after_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.retouch_presets TO anon, authenticated;
GRANT ALL ON public.retouch_presets TO service_role;
ALTER TABLE public.retouch_presets ENABLE ROW LEVEL SECURITY;

-- Visitors (incl. anonymous) see only active presets; admins see everything
-- so the management page can list drafts/disabled presets too.
CREATE POLICY "retouch_presets_select" ON public.retouch_presets FOR SELECT TO anon, authenticated
  USING (is_active = true OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "retouch_presets_admin_write" ON public.retouch_presets FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER retouch_presets_set_updated_at
  BEFORE UPDATE ON public.retouch_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Usage log: one row per generation attempt, used only for basic per-session
-- rate limiting and admin visibility into usage. Customer photos and
-- results are never persisted here or anywhere else — they're processed
-- in-request and returned straight to the browser.
CREATE TABLE public.retouch_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid REFERENCES public.retouch_presets(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  success boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.retouch_usage_log TO service_role;
ALTER TABLE public.retouch_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retouch_usage_log_admin_select" ON public.retouch_usage_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX retouch_usage_log_session_created_idx ON public.retouch_usage_log (session_id, created_at DESC);
