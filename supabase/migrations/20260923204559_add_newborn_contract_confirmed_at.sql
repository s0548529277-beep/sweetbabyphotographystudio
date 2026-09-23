-- Tracks the one-click "קראתי ואני מאשרת" confirmation on the combined
-- prep-guide + legal-contract page (/newborn/confirm/$token — see
-- newborn-orders.functions.ts's confirmNewbornContractByToken). Same
-- access_token-based public surface as the existing proof gallery
-- (/newborn/gallery/$token) — no separate token needed.
ALTER TABLE public.newborn_package_orders
  ADD COLUMN IF NOT EXISTS contract_confirmed_at timestamptz;

NOTIFY pgrst, 'reload schema';
