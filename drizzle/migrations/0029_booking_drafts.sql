-- Abandoned-booking drafts (owner approved 2026-11-03):
-- a visitor who started a studio booking (in the chat wizard, /booking or the
-- questionnaire) and left. The browser sends its progress here (only once a
-- phone or email is known) so the admin sees who started and where she stopped.
-- Anonymous visitors can only call save_booking_draft() / complete_booking_draft();
-- the table itself is admin-only (read / update / delete).

CREATE TABLE IF NOT EXISTS public.booking_drafts (
  client_key text PRIMARY KEY,
  name text,
  phone text,
  email text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  step text,
  completed boolean NOT NULL DEFAULT false,
  handled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.booking_drafts TO authenticated;
GRANT ALL ON public.booking_drafts TO service_role;
ALTER TABLE public.booking_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "booking_drafts_admin_read" ON public.booking_drafts;
CREATE POLICY "booking_drafts_admin_read" ON public.booking_drafts
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "booking_drafts_admin_update" ON public.booking_drafts;
CREATE POLICY "booking_drafts_admin_update" ON public.booking_drafts
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "booking_drafts_admin_delete" ON public.booking_drafts;
CREATE POLICY "booking_drafts_admin_delete" ON public.booking_drafts
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.save_booking_draft(
  _key text, _name text, _phone text, _email text, _progress jsonb, _step text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text := left(btrim(coalesce(_key, '')), 64);
  p text := left(btrim(coalesce(_phone, '')), 30);
  e text := left(btrim(coalesce(_email, '')), 120);
BEGIN
  IF length(k) < 8 THEN RETURN; END IF;
  IF length(p) < 7 AND position('@' in e) = 0 THEN RETURN; END IF; -- no way to reach her
  IF length(coalesce(_progress::text, '')) > 4000 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_drafts WHERE client_key = k)
     AND (SELECT count(*) FROM public.booking_drafts) >= 3000 THEN
    RETURN; -- keep the table small even if someone floods it
  END IF;
  INSERT INTO public.booking_drafts (client_key, name, phone, email, progress, step)
  VALUES (k, left(btrim(coalesce(_name, '')), 80), p, e, coalesce(_progress, '{}'::jsonb), left(coalesce(_step, ''), 30))
  ON CONFLICT (client_key) DO UPDATE
    SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
        progress = EXCLUDED.progress, step = EXCLUDED.step, updated_at = now()
    WHERE public.booking_drafts.completed = false;
END;
$$;
REVOKE ALL ON FUNCTION public.save_booking_draft(text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_booking_draft(text, text, text, text, jsonb, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_booking_draft(_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.booking_drafts
     SET completed = true, updated_at = now()
   WHERE client_key = left(btrim(coalesce(_key, '')), 64);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_booking_draft(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_booking_draft(text) TO anon, authenticated;
