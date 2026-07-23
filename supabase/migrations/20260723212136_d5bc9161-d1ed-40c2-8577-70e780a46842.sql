
-- 1) Remove financial-field blocking triggers (user authorized)
DROP TRIGGER IF EXISTS trg_block_client_financial_changes ON public.orders;
DROP TRIGGER IF EXISTS block_client_financial_changes ON public.orders;
DROP TRIGGER IF EXISTS trg_block_client_financial_changes_booking ON public.bookings;
DROP TRIGGER IF EXISTS block_client_financial_changes_booking ON public.bookings;
DROP FUNCTION IF EXISTS public.block_client_financial_changes() CASCADE;
DROP FUNCTION IF EXISTS public.block_client_financial_changes_booking() CASCADE;

-- 2) Hourly rental support on item_availability
ALTER TABLE public.item_availability
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz;

-- 3) Reserved props on studio bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reserved_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4) Orders: hourly rental window
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_at timestamptz;
