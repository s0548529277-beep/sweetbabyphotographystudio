-- Inquiry leads tracking (/admin/leads) — NOT the older public.leads table (newsletter sign-ups): every inquiry to Michal (email, site form, WhatsApp,
-- referrals sent to the sleep consultant שולמית בן נעים) with status + follow-up.
-- Rows are written by the admin UI and by the scheduled email-assistant task
-- (Claude) through upsert_lead_from_assistant(), a SECURITY DEFINER function
-- guarded by a secret token (only its sha256 is stored here).

CREATE TABLE IF NOT EXISTS public.inquiry_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  phone text,
  source text NOT NULL DEFAULT 'email',        -- email | site_form | whatsapp | phone | shulamit | other
  topic text NOT NULL DEFAULT 'other',         -- newborn | birth_basket | upsherin | family | outdoor | studio | props | other
  message text,
  status text NOT NULL DEFAULT 'new',          -- new | replied | follow_up | booked | not_relevant
  referred_to_shulamit boolean NOT NULL DEFAULT false,
  first_contact_at timestamptz NOT NULL DEFAULT now(),
  last_contact_at timestamptz,
  follow_up_sent_at timestamptz,
  gmail_thread_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_leads_gmail_thread_uidx ON public.inquiry_leads (gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inquiry_leads_email_idx ON public.inquiry_leads (lower(email));
CREATE INDEX IF NOT EXISTS inquiry_leads_status_idx ON public.inquiry_leads (status);

GRANT ALL ON public.inquiry_leads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_leads TO authenticated;
ALTER TABLE public.inquiry_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inquiry_leads_admin_all" ON public.inquiry_leads;
CREATE POLICY "inquiry_leads_admin_all" ON public.inquiry_leads FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Upsert called by the email assistant with the anon key + secret token.
-- Match order: gmail_thread_id, then same email (case-insensitive) → update; else insert.
-- Only non-null payload fields overwrite; status never moves backwards from 'booked'.
CREATE OR REPLACE FUNCTION public.upsert_lead_from_assistant(p_token text, p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') <> '3b262b0f63e74f8b8522b1670520a6ae2e9a2333de96ae5057558aac911df475' THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  IF nullif(p->>'gmail_thread_id', '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.inquiry_leads WHERE gmail_thread_id = p->>'gmail_thread_id' LIMIT 1;
  END IF;
  IF v_id IS NULL AND nullif(p->>'email', '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.inquiry_leads WHERE lower(email) = lower(p->>'email')
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.inquiry_leads (name, email, phone, source, topic, message, status,
      referred_to_shulamit, first_contact_at, last_contact_at, follow_up_sent_at, gmail_thread_id, notes)
    VALUES (
      nullif(p->>'name',''), nullif(p->>'email',''), nullif(p->>'phone',''),
      coalesce(nullif(p->>'source',''), 'email'), coalesce(nullif(p->>'topic',''), 'other'),
      left(nullif(p->>'message',''), 2000), coalesce(nullif(p->>'status',''), 'new'),
      coalesce((p->>'referred_to_shulamit')::boolean, false),
      coalesce((p->>'first_contact_at')::timestamptz, now()),
      (p->>'last_contact_at')::timestamptz, (p->>'follow_up_sent_at')::timestamptz,
      nullif(p->>'gmail_thread_id',''), nullif(p->>'notes',''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.inquiry_leads SET
      name = coalesce(nullif(p->>'name',''), name),
      phone = coalesce(nullif(p->>'phone',''), phone),
      email = coalesce(email, nullif(p->>'email','')),
      topic = CASE WHEN coalesce(p->>'topic','') IN ('', 'other') THEN topic ELSE p->>'topic' END,
      message = coalesce(left(nullif(p->>'message',''), 2000), message),
      status = CASE WHEN status IN ('booked','not_relevant') THEN status
                    ELSE coalesce(nullif(p->>'status',''), status) END,
      referred_to_shulamit = referred_to_shulamit OR coalesce((p->>'referred_to_shulamit')::boolean, false),
      last_contact_at = coalesce((p->>'last_contact_at')::timestamptz, last_contact_at),
      follow_up_sent_at = coalesce((p->>'follow_up_sent_at')::timestamptz, follow_up_sent_at),
      gmail_thread_id = coalesce(gmail_thread_id, nullif(p->>'gmail_thread_id','')),
      notes = CASE WHEN nullif(p->>'notes','') IS NULL THEN notes
                   WHEN notes IS NULL THEN p->>'notes'
                   ELSE notes || E'\n' || (p->>'notes') END,
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_lead_from_assistant(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_lead_from_assistant(text, jsonb) TO anon, authenticated;
