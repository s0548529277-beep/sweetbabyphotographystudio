-- Owner request 2026-11-19: a "custom studio package" kind in the unified client-hub page
-- (/admin/newborn-packages). Booking one reserves the studio (a calendar-block row in
-- `bookings`, like newborn orders do) — kept in its OWN table so it never reaches the
-- photographer-site sync trigger on newborn_package_orders. ADDITIVE ONLY, idempotent.

CREATE TABLE IF NOT EXISTS public.studio_custom_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name text NOT NULL DEFAULT 'סטודיו מותאם אישית',
  package_description text,
  total_price numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  last_payment_at timestamptz,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text,
  session_date date,
  session_time text,
  duration_hours numeric NOT NULL DEFAULT 2 CHECK (duration_hours > 0 AND duration_hours <= 12),
  notes text,
  blocking_booking_id uuid,
  google_event_id text,
  shoot_done_at timestamptz,
  payment_done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.studio_custom_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_custom_orders TO authenticated;
ALTER TABLE public.studio_custom_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "studio_custom_orders_admin_all" ON public.studio_custom_orders;
CREATE POLICY "studio_custom_orders_admin_all" ON public.studio_custom_orders FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS studio_custom_orders_session_date_idx ON public.studio_custom_orders (session_date);

NOTIFY pgrst, 'reload schema';
