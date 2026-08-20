-- Atomic credit-balance adjustment for customer_loyalty.
--
-- awardCashback/deductCredit previously did SELECT credit_balance then
-- UPDATE credit_balance = <computed> in two separate round-trips. Two
-- confirmations for the same customer landing at nearly the same moment
-- (e.g. an order and a booking both confirmed within the same second) could
-- interleave: both read the same starting balance, both write their own
-- result, and the second write clobbers the first — one of the two credits
-- silently vanishes.
--
-- This function does the read-modify-write as a single atomic UPDATE
-- statement inside one round trip. Postgres takes a row lock for the
-- duration of the UPDATE, so a second concurrent call for the same user_id
-- waits for the first to commit and then applies on top of the already
-- up-to-date balance — no lost update is possible.
--
-- `delta` is signed: positive to award cashback, negative to deduct credit.
-- The balance is clamped at 0 so a deduction can never drive it negative
-- (mirrors the previous Math.max(0, ...) in application code).
create or replace function public.adjust_loyalty_credit(p_user_id uuid, p_delta numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  update public.customer_loyalty
  set credit_balance = greatest(0, credit_balance + p_delta),
      updated_at = now()
  where user_id = p_user_id
  returning credit_balance;
$$;

-- Only service_role calls this (loyalty.ts always runs with the
-- service-role client) — no grant to `authenticated`, consistent with
-- customer_loyalty having no authenticated write policy at all.
revoke all on function public.adjust_loyalty_credit(uuid, numeric) from public;
grant execute on function public.adjust_loyalty_credit(uuid, numeric) to service_role;
