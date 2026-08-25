-- Switch retouch_allowed_clients from being keyed by an existing
-- auth.users row to being keyed by email. The admin needs to grant access
-- to any client — including someone who booked a photoshoot by phone/in
-- person and has no site account at all yet — not only people who already
-- appear in "ניהול לקוחות". Granting by email works before the client ever
-- signs up: once they log in with that email, access resolves.
DROP TABLE IF EXISTS public.retouch_allowed_clients;

CREATE TABLE public.retouch_allowed_clients (
  email text PRIMARY KEY CHECK (email = lower(email)),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.retouch_allowed_clients TO authenticated;
GRANT ALL ON public.retouch_allowed_clients TO service_role;
ALTER TABLE public.retouch_allowed_clients ENABLE ROW LEVEL SECURITY;

-- A client can check only whether their own (logged-in) email is on the
-- list; admins can see and manage everyone's.
CREATE POLICY "retouch_allowed_clients_self_select" ON public.retouch_allowed_clients FOR SELECT TO authenticated
  USING (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "retouch_allowed_clients_admin_write" ON public.retouch_allowed_clients FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
