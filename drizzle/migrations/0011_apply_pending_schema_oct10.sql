ALTER TABLE public.customer_loyalty ADD COLUMN IF NOT EXISTS custom_hourly_rate numeric(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS recurring_series_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS abandoned_hold_reminder_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  notes text,
  user_id uuid,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_entries_pending_by_date_idx ON public.waitlist_entries (session_date) WHERE notified_at IS NULL;
GRANT SELECT, UPDATE ON public.waitlist_entries TO authenticated;
GRANT ALL ON public.waitlist_entries TO service_role;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_entries_admin_select" ON public.waitlist_entries FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "waitlist_entries_admin_update" ON public.waitlist_entries FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.subscription_passes DROP CONSTRAINT IF EXISTS subscription_passes_status_check;
ALTER TABLE public.subscription_passes ADD CONSTRAINT subscription_passes_status_check CHECK (status IN ('active', 'cancelled', 'pending_approval'));
ALTER TABLE public.subscription_passes ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.subscription_passes ADD COLUMN IF NOT EXISTS approval_nudge_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.subscription_passes ADD COLUMN IF NOT EXISTS approval_nudge_sent_at timestamptz;

ALTER TABLE public.customer_loyalty ADD COLUMN IF NOT EXISTS fixed_discount_percent integer NOT NULL DEFAULT 0;