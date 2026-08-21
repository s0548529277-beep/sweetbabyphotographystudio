-- Mirrors the customer_loyalty split: credit_used on an order/booking now
-- records how much came from the cashback bucket vs the manual bucket, so
-- cancellation can refund each amount into the bucket it actually came
-- from (see spend_loyalty_credit in 20260822090000_split_loyalty_credit_by_source.sql).
--
-- credit_used is kept as a GENERATED sum column so existing reads (notes
-- text, any reporting) keep working unchanged.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_used_cashback numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_used_manual numeric(10,2) NOT NULL DEFAULT 0;
UPDATE public.orders
SET credit_used_cashback = credit_used
WHERE credit_used_cashback = 0 AND credit_used_manual = 0 AND credit_used <> 0;
ALTER TABLE public.orders DROP COLUMN credit_used;
ALTER TABLE public.orders
  ADD COLUMN credit_used numeric(10,2) GENERATED ALWAYS AS (credit_used_cashback + credit_used_manual) STORED;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS credit_used_cashback numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS credit_used_manual numeric(10,2) NOT NULL DEFAULT 0;
UPDATE public.bookings
SET credit_used_cashback = credit_used
WHERE credit_used_cashback = 0 AND credit_used_manual = 0 AND credit_used <> 0;
ALTER TABLE public.bookings DROP COLUMN credit_used;
ALTER TABLE public.bookings
  ADD COLUMN credit_used numeric(10,2) GENERATED ALWAYS AS (credit_used_cashback + credit_used_manual) STORED;
