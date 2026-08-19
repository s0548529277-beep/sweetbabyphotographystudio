-- Re-asserted with IF NOT EXISTS in case the previous migration adding
-- confirmation_sent_at was not actually applied to the live database yet
-- (this is what silently breaks confirmOrderDeposit's SELECT — the missing
-- column throws before any email is built, so neither the email nor the
-- "already sent" guard ever runs).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;

-- Tracks whether the "pickup in ~12 hours" reminder email has already been
-- sent for a props/equipment order, mirroring bookings.reminder_sent_at.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_reminder_pending
  ON public.orders (pickup_at)
  WHERE reminder_sent_at IS NULL;
