ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS contract_confirmed_at timestamptz;
NOTIFY pgrst, 'reload schema';