-- The contract sections exactly as they were sent (JSON), for outdoor orders and photo clients — same idea as 0037 for newborn. Additive.
ALTER TABLE public.outdoor_package_orders ADD COLUMN IF NOT EXISTS contract_snapshot text;
ALTER TABLE public.outdoor_package_orders ADD COLUMN IF NOT EXISTS contract_snapshot_at timestamptz;
ALTER TABLE public.photo_client_workflows ADD COLUMN IF NOT EXISTS contract_snapshot text;
ALTER TABLE public.photo_client_workflows ADD COLUMN IF NOT EXISTS contract_snapshot_at timestamptz;
