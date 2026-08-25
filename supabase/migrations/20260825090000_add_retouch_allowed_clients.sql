-- Gates /photo-retouch to hand-picked clients instead of every visitor.
-- The admin grants/revokes access per client from the "ניהול לקוחות" page;
-- a row here means that user may use the AI photo retouch feature. Admins
-- always have access regardless of this table (checked in application code
-- / the server function, not here).
CREATE TABLE public.retouch_allowed_clients (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.retouch_allowed_clients TO authenticated;
GRANT ALL ON public.retouch_allowed_clients TO service_role;
ALTER TABLE public.retouch_allowed_clients ENABLE ROW LEVEL SECURITY;

-- A client can check only their own access; admins can see everyone's (for
-- the client-management list) and are the only ones who can grant/revoke.
CREATE POLICY "retouch_allowed_clients_self_select" ON public.retouch_allowed_clients FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "retouch_allowed_clients_admin_write" ON public.retouch_allowed_clients FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
