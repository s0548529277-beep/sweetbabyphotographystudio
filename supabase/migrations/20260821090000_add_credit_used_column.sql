-- The amount of loyalty credit applied to an order/booking at checkout was
-- only ever recorded as free text inside the `notes` column
-- ("קרדיט לקוחה · ₪123"), never as a structured amount. That made it
-- impossible to reliably refund the credit on cancellation — there was no
-- number to read back, only a string to parse.
--
-- credit_used stores that amount directly so cancelOrder/cancelBooking can
-- refund it atomically via adjust_loyalty_credit without touching notes.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_used numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS credit_used numeric(10,2) NOT NULL DEFAULT 0;
