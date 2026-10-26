-- Section-by-section contract signing page (/contract/$kind/$token), owner request 2026-10-26.
-- newborn_package_orders already has access_token + contract_confirmed_at; the other two
-- contract tracks get the same pair so their clients can confirm on the site too.
ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS contract_token text,
  ADD COLUMN IF NOT EXISTS contract_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS contract_confirmed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS photo_client_workflows_contract_token_key
  ON public.photo_client_workflows (contract_token);

ALTER TABLE public.outdoor_package_orders
  ADD COLUMN IF NOT EXISTS contract_token text,
  ADD COLUMN IF NOT EXISTS contract_confirmed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS outdoor_package_orders_contract_token_key
  ON public.outdoor_package_orders (contract_token);
