-- Tracks whether the ~4-hours-before reminder (a Yemot voice call) has been
-- sent, separately from the existing ~12-hours-before reminder_sent_at
-- column, so both windows can fire independently for the same booking/order.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_4h_sent_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reminder_4h_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
