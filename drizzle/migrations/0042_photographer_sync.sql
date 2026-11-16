-- Orders mirrored from the photographer site (michalsiboni.co.il). Idempotent.
ALTER TABLE public.newborn_package_orders
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS newborn_package_orders_external_uidx
  ON public.newborn_package_orders (external_source, external_id)
  WHERE external_id IS NOT NULL;
