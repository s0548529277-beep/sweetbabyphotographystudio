-- Lead funnels (משפכי שאלון): an entry funnel (regular photographer vs. client) and one funnel per page
-- (studio rental / photography with Michal / newborn). Every finished funnel becomes a row here.
-- Written ONLY by the server function (service role); the admin reads and updates (status "טופל").
CREATE TABLE IF NOT EXISTS public.funnel_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  funnel text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  marketing_consent boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation text,
  score integer NOT NULL DEFAULT 0,
  is_hot boolean NOT NULL DEFAULT false,
  source_page text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  handled_at timestamptz,
  CONSTRAINT funnel_leads_status_check CHECK (status IN ('new', 'handled')),
  CONSTRAINT funnel_leads_funnel_check CHECK (funnel IN ('studio', 'photography', 'newborn'))
);
CREATE INDEX IF NOT EXISTS funnel_leads_created_idx ON public.funnel_leads (created_at DESC);

REVOKE ALL ON public.funnel_leads FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.funnel_leads TO authenticated;
GRANT ALL ON public.funnel_leads TO service_role;
ALTER TABLE public.funnel_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funnel_leads_admin_select" ON public.funnel_leads;
CREATE POLICY "funnel_leads_admin_select" ON public.funnel_leads FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "funnel_leads_admin_update" ON public.funnel_leads;
CREATE POLICY "funnel_leads_admin_update" ON public.funnel_leads FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- The visitor-journey link accepts the new kind.
ALTER TABLE public.visitor_identities DROP CONSTRAINT IF EXISTS visitor_identities_kind_check;
ALTER TABLE public.visitor_identities ADD CONSTRAINT visitor_identities_kind_check
  CHECK (kind IN ('booking_draft', 'booking', 'order', 'intake', 'contact', 'chat_lead', 'funnel'));

NOTIFY pgrst, 'reload schema';
