-- Answers the client fills in on the contract signing page (/contract/$kind/$token),
-- owner request 2026-10-26: children (count/ages/names), publishing consent,
-- balance payment method, free notes. Stored as one jsonb per contract.
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS contract_answers jsonb;
ALTER TABLE public.photo_client_workflows ADD COLUMN IF NOT EXISTS contract_answers jsonb;
ALTER TABLE public.outdoor_package_orders ADD COLUMN IF NOT EXISTS contract_answers jsonb;
