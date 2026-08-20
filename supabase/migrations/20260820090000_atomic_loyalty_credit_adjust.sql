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
-- This function does the read-modify-write as a single atomic UPSERT
-- statement inside one round trip. Postgres takes a row lock for the
-- duration of the statement, so a second concurrent call for the same
-- user_id waits for the first to commit and then applies on top of the
-- already up-to-date balance — no lost update is possible.
--
-- Upsert (not plain UPDATE) so this also works for a customer who has no
-- customer_loyalty row yet — e.g. a manual credit grant to someone who was
-- never enrolled in the cashback-% program. INSERT with cashback_percent=0
-- means "no ongoing cashback %, just this one-off credit".
--
-- `delta` is signed: positive to award cashback / grant credit, negative to
-- deduct. The balance is clamped at 0 so a deduction can never drive it
-- negative (mirrors the previous Math.max(0, ...) in application code).
create or replace function public.adjust_loyalty_credit(p_user_id uuid, p_delta numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  insert into public.customer_loyalty (user_id, cashback_percent, credit_balance, updated_at)
  values (p_user_id, 0, greatest(0, p_delta), now())
  on conflict (user_id) do update
    set credit_balance = greatest(0, public.customer_loyalty.credit_balance + p_delta),
        updated_at = now()
  returning credit_balance;
$$;

-- Only service_role calls this (loyalty.ts always runs with the
-- service-role client) — no grant to `authenticated`, consistent with
-- customer_loyalty having no authenticated write policy at all.
revoke all on function public.adjust_loyalty_credit(uuid, numeric) from public;
grant execute on function public.adjust_loyalty_credit(uuid, numeric) to service_role;
