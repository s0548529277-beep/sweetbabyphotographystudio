-- Internal (admin-only) tracking for a sold newborn-package deal, from the
-- moment Michal closes it through delivery — a lightweight CRM/pipeline,
-- separate from the public booking calendar (bookings/orders tables): this
-- is never customer-facing, never shown on the site, just Michal's own
-- checklist per customer. See newborn-orders.functions.ts and
-- /admin/newborn-packages.
CREATE TABLE public.newborn_package_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id text NOT NULL,
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_price numeric NOT NULL DEFAULT 0,
  addons_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text,
  session_date date,
  notes text,
  -- The 8-step pipeline Michal described, in order — each null until she
  -- checks it off, then holds the moment it was marked done. Nullable
  -- on purpose (unchecking just clears it back to null).
  date_deposit_at timestamptz,
  shoot_done_at timestamptz,
  photos_sent_at timestamptz,
  payment_done_at timestamptz,
  editing_done_at timestamptz,
  album_design_done_at timestamptz,
  printing_done_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.newborn_package_orders TO service_role;
ALTER TABLE public.newborn_package_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newborn_package_orders_admin_select" ON public.newborn_package_orders FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "newborn_package_orders_admin_write" ON public.newborn_package_orders FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
