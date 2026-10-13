-- Admin-editable newborn package list — a "version 2" alternative to the
-- hardcoded NEWBORN_PACKAGES array in src/lib/newborn-packages.ts, modeled
-- directly on the photographer-portal project's `package_types` table/UI
-- (same field names: name/price/description/sort_order/active) per
-- explicit request to copy that system as-is so it can be compared
-- side-by-side with the existing hardcoded list. Purely additive — doesn't
-- touch NEWBORN_PACKAGES, newborn_package_orders, or anything that reads
-- from them; nothing here is wired into order creation yet.
CREATE TABLE public.newborn_package_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.newborn_package_types TO service_role;
ALTER TABLE public.newborn_package_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newborn_package_types_admin_all" ON public.newborn_package_types FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
