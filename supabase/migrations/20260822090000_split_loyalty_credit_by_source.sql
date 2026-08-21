-- Splits credit_balance into two tracked sources: credit earned through the
-- ongoing cashback-% program vs credit granted manually by an admin
-- (one-off gestures/corrections), so the client card can show both.
--
-- credit_balance itself is kept as a GENERATED column (sum of the two), so
-- every existing read of credit_balance (checkout.tsx, account.tsx,
-- admin.clients.tsx, previewCreditUse) keeps working unchanged.
--
-- Historical note: balances that existed before this migration are, by
-- definition, un-splittable after the fact — we don't have a ledger of how
-- each ₪ was earned. They're attributed to the cashback bucket, since that
-- was the only way to earn credit before manual grants existed.
ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS cashback_credit_balance numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS manual_credit_balance numeric(10,2) NOT NULL DEFAULT 0;

UPDATE public.customer_loyalty
SET cashback_credit_balance = credit_balance
WHERE cashback_credit_balance = 0 AND manual_credit_balance = 0 AND credit_balance <> 0;

ALTER TABLE public.customer_loyalty DROP COLUMN credit_balance;
ALTER TABLE public.customer_loyalty
  ADD COLUMN credit_balance numeric(10,2)
  GENERATED ALWAYS AS (cashback_credit_balance + manual_credit_balance) STORED;

-- adjust_loyalty_credit now takes which bucket to touch. p_source defaults
-- to 'cashback' so the existing awardCashback call site (2-arg RPC call)
-- keeps working without changes.
drop function if exists public.adjust_loyalty_credit(uuid, numeric);

create or replace function public.adjust_loyalty_credit(p_user_id uuid, p_delta numeric, p_source text default 'cashback')
returns table (credit_balance numeric, cashback_credit_balance numeric, manual_credit_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source not in ('cashback', 'manual') then
    raise exception 'invalid credit source: %', p_source;
  end if;

  if p_source = 'cashback' then
    insert into public.customer_loyalty (user_id, cashback_percent, cashback_credit_balance, updated_at)
    values (p_user_id, 0, greatest(0, p_delta), now())
    on conflict (user_id) do update
      set cashback_credit_balance = greatest(0, public.customer_loyalty.cashback_credit_balance + p_delta),
          updated_at = now();
  else
    insert into public.customer_loyalty (user_id, cashback_percent, manual_credit_balance, updated_at)
    values (p_user_id, 0, greatest(0, p_delta), now())
    on conflict (user_id) do update
      set manual_credit_balance = greatest(0, public.customer_loyalty.manual_credit_balance + p_delta),
          updated_at = now();
  end if;

  return query
    select cl.credit_balance, cl.cashback_credit_balance, cl.manual_credit_balance
    from public.customer_loyalty cl
    where cl.user_id = p_user_id;
end;
$$;

revoke all on function public.adjust_loyalty_credit(uuid, numeric, text) from public;
grant execute on function public.adjust_loyalty_credit(uuid, numeric, text) to service_role;

-- Spending at checkout draws from cashback credit first, then manual credit,
-- as a single atomic row-locked operation — so a customer's spend can never
-- race with a concurrent award/grant/refund for the same user, and the
-- split is computed inside the same transaction that debits the balances
-- (needed so cancellations can refund into the correct bucket later).
create or replace function public.spend_loyalty_credit(p_user_id uuid, p_amount numeric)
returns table (spent_cashback numeric, spent_manual numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cash numeric;
  v_manual numeric;
  v_from_cash numeric;
  v_from_manual numeric;
begin
  select cl.cashback_credit_balance, cl.manual_credit_balance
    into v_cash, v_manual
  from public.customer_loyalty cl
  where cl.user_id = p_user_id
  for update;

  if not found or p_amount <= 0 then
    return query select 0::numeric, 0::numeric;
    return;
  end if;

  v_from_cash := least(v_cash, p_amount);
  v_from_manual := least(v_manual, p_amount - v_from_cash);

  update public.customer_loyalty
  set cashback_credit_balance = cashback_credit_balance - v_from_cash,
      manual_credit_balance = manual_credit_balance - v_from_manual,
      updated_at = now()
  where user_id = p_user_id;

  return query select v_from_cash, v_from_manual;
end;
$$;

revoke all on function public.spend_loyalty_credit(uuid, numeric) from public;
grant execute on function public.spend_loyalty_credit(uuid, numeric) to service_role;
