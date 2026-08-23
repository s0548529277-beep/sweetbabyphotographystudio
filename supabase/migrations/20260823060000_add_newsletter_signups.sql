-- Marketing lead capture: a lightweight "get 15% off" email signup shown
-- in the footer, separate from customer accounts (auth.users) and
-- bookings. Inserts go through the subscribeNewsletter server function
-- using the service-role client (see client.server.ts) — same write
-- pattern as site_bot_requests, so there is no anon insert policy here,
-- only an admin-only read.
CREATE TABLE public.newsletter_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.newsletter_signups TO authenticated;
GRANT ALL ON public.newsletter_signups TO service_role;
ALTER TABLE public.newsletter_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newsletter_signups_admin_select" ON public.newsletter_signups FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
