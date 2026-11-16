-- Studio mailing list: subscriber name/status + personal unsubscribe token, and a log of sent campaigns
-- (ported from the photographer site's weekly newsletter).
ALTER TABLE public.newsletter_signups
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'subscribed',
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.newsletter_signups
    ADD CONSTRAINT newsletter_signups_status_check CHECK (status IN ('subscribed', 'unsubscribed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_signups_unsubscribe_token_key
  ON public.newsletter_signups (unsubscribe_token);

CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  draft jsonb NOT NULL,
  total integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT ON public.newsletter_campaigns TO authenticated;
GRANT ALL ON public.newsletter_campaigns TO service_role;
ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_campaigns_admin_select" ON public.newsletter_campaigns;
CREATE POLICY "newsletter_campaigns_admin_select" ON public.newsletter_campaigns FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';
