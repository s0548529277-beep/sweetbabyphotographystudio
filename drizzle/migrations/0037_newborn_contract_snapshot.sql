-- The contract text exactly as it was sent to the client (details filled in), so the signing page keeps showing
-- the same text even if the template or the order details change later. Additive.
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS contract_snapshot text;
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS contract_snapshot_at timestamptz;
