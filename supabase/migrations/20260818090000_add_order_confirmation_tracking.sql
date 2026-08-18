-- Tracks whether the full "Order Confirmation - Props Rental" email
-- (with the payment receipt attached) has already been sent for this
-- order, so confirmOrderDeposit never double-sends it.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
