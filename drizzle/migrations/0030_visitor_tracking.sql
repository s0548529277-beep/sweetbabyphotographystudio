-- Visitor tracking + lead journey (owner request 2026-11-03).
-- Consent-gated on the client (only visitors who accepted the cookie banner ever get a visitor_id).
--  1. analytics_sessions.visitor_id: a persistent per-browser id, so "how many times did this person come" is known.
--  2. analytics_events.duration_seconds: active time (tab visible) spent on a page view.
--  3. visitor_identities: links a visitor_id to the details the person left herself (booking, order,
--     questionnaire, booking draft). Written ONLY by server functions with the service role; admin read only.
-- phone is stored as a normalized key (digits, without the leading 0 / 972) so 054-123-4567 and +972541234567 match.

ALTER TABLE public.analytics_sessions ADD COLUMN IF NOT EXISTS visitor_id uuid;
CREATE INDEX IF NOT EXISTS analytics_sessions_visitor_idx ON public.analytics_sessions (visitor_id) WHERE visitor_id IS NOT NULL;

ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS duration_seconds integer;

CREATE TABLE IF NOT EXISTS public.visitor_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('booking_draft', 'booking', 'order', 'intake', 'contact', 'chat_lead')),
  ref_id text NOT NULL,
  name text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visitor_id, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS visitor_identities_visitor_idx ON public.visitor_identities (visitor_id);
CREATE INDEX IF NOT EXISTS visitor_identities_phone_idx ON public.visitor_identities (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS visitor_identities_email_idx ON public.visitor_identities (lower(email)) WHERE email IS NOT NULL;

-- Project default privileges hand anon/authenticated everything on new tables; take it back (RLS also blocks writes).
REVOKE ALL ON public.visitor_identities FROM anon, authenticated;
GRANT SELECT ON public.visitor_identities TO authenticated;
GRANT ALL ON public.visitor_identities TO service_role;
ALTER TABLE public.visitor_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visitor_identities_admin_read" ON public.visitor_identities;
CREATE POLICY "visitor_identities_admin_read" ON public.visitor_identities
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
