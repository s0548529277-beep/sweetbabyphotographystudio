-- "ניהול לקוחות" (/admin/client-management) — a self-contained client
-- management area: clients, scheduled photo sessions (journal + calendar),
-- client payment accounts, and automatic email reminders. Deliberately its
-- own cm_* tables rather than reusing bookings/newborn_package_orders, so
-- it can't disturb studio availability or any existing flow. All three are
-- admin-only (RLS), read/written directly by the admin page through the
-- authenticated browser client; the periodic reminder job
-- (runDueClientManagementReminders, called from api.send-booking-reminders.ts)
-- uses the service role. Settings live in app_settings under key
-- 'client_management_settings' (JSON).

CREATE TABLE IF NOT EXISTS public.cm_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  baby_name text,
  birth_date date,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  start_time text NOT NULL DEFAULT '09:00',
  session_type text NOT NULL DEFAULT 'ניו בורן',
  time_slot text,
  part_label text,
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cm_sessions_date_idx ON public.cm_sessions (session_date);
CREATE INDEX IF NOT EXISTS cm_sessions_client_idx ON public.cm_sessions (client_id);

CREATE TABLE IF NOT EXISTS public.cm_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.cm_sessions(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'צילום',
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cm_payment_accounts_client_idx ON public.cm_payment_accounts (client_id);

GRANT ALL ON public.cm_clients TO service_role;
GRANT ALL ON public.cm_sessions TO service_role;
GRANT ALL ON public.cm_payment_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cm_clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cm_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cm_payment_accounts TO authenticated;

ALTER TABLE public.cm_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cm_clients_admin_all" ON public.cm_clients;
CREATE POLICY "cm_clients_admin_all" ON public.cm_clients FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "cm_sessions_admin_all" ON public.cm_sessions;
CREATE POLICY "cm_sessions_admin_all" ON public.cm_sessions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "cm_payment_accounts_admin_all" ON public.cm_payment_accounts;
CREATE POLICY "cm_payment_accounts_admin_all" ON public.cm_payment_accounts FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
