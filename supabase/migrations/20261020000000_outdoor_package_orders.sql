-- Lightweight internal CRM for "צילומי חוץ" (outdoor/location photography)
-- leads/deals — mirrors newborn_package_orders' own spirit (an
-- admin-only pipeline, never customer-facing, see that table's own
-- migration comment) but scoped to exactly what was asked for this track:
-- contact details, a styling-call date (with an automatic reminder to the
-- studio owner), the session day/time, whether the deposit came in, and a
-- one-click contract send — not the full newborn production pipeline
-- (gallery, proof selection, Drive sync etc.), which this track has no use
-- for.

-- Admin-editable outdoor package list — same shape as newborn_package_types
-- (20261016000000_newborn_package_types.sql): name/price/description/
-- sort_order/active.
CREATE TABLE public.outdoor_package_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.outdoor_package_types TO service_role;
ALTER TABLE public.outdoor_package_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outdoor_package_types_admin_all" ON public.outdoor_package_types FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.outdoor_package_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type_id uuid REFERENCES public.outdoor_package_types(id) ON DELETE SET NULL,
  -- Snapshot so a later edit/delete of the package type doesn't rewrite
  -- history — same pattern as newborn_package_orders.plan_name etc.
  package_name text,
  package_description text,
  total_price numeric,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text,
  children_count integer,
  children_names text,
  styling_call_date date,
  styling_call_reminder_sent_at timestamptz,
  session_date date,
  session_time text, -- "HH:MM", free text like bookings.start_time
  deposit_paid boolean NOT NULL DEFAULT false,
  contract_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.outdoor_package_orders TO service_role;
ALTER TABLE public.outdoor_package_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outdoor_package_orders_admin_all" ON public.outdoor_package_orders FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
