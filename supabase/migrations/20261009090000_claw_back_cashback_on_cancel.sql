-- Per explicit report: cancelling a booking/order used to refund credit
-- SPENT at checkout (credit_used_cashback/manual, already handled by
-- adminSetStatus/cancelBooking/cancelOrder), but never clawed back
-- cashback EARNED from that same purchase (awarded via awardCashback once
-- payment was confirmed) — so a customer could book, get the booking
-- cancelled, and keep the cashback it generated.
--
-- awardCashback computes `amount * cashback_percent / 100` using whatever
-- the customer's rate/expiry was AT CONFIRMATION TIME — recomputing that
-- at cancellation time could differ if the rate changed since, so instead
-- these columns snapshot exactly how much was actually credited for this
-- specific booking/order, the same "snapshot so later changes don't
-- rewrite history" spirit as other snapshot columns in this app (e.g.
-- subscription_passes.plan_name). Defaults to 0 — most rows never earn
-- cashback at all (below CASHBACK_MIN_AMOUNT, no active loyalty, etc).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cashback_awarded numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cashback_awarded numeric(10,2) NOT NULL DEFAULT 0;
