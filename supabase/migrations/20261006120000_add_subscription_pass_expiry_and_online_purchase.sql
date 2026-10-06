-- Adds expiry + self-serve online-card-purchase support to the existing
-- SWEET-10+1-style studio-visit pass system (subscription_plans /
-- subscription_passes, see 20260823090000_add_subscription_passes.sql).
-- A "plan" now also carries how many months a pass purchased from it stays
-- valid; a "pass" snapshots that into its own expires_at at creation time
-- (purchased_at + validity_months), same "snapshot so a later plan edit
-- doesn't rewrite history" spirit as the existing plan_name/total_entries
-- columns on subscription_passes.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS validity_months integer NOT NULL DEFAULT 6 CHECK (validity_months > 0);

ALTER TABLE public.subscription_passes
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  -- true for every pass today (admin only creates one after confirming
  -- payment) — distinguishes a self-serve online-card purchase (see
  -- purchaseSubscriptionPass) from one an admin creates manually, so
  -- /admin/subscriptions can flag "paid online, not yet reconciled" rows.
  ADD COLUMN IF NOT EXISTS purchase_source text NOT NULL DEFAULT 'admin' CHECK (purchase_source IN ('admin', 'online_card'));

-- Backfill any pre-existing passes (none expected in practice — this table
-- is brand new in this app's lifetime — but keep the migration honest) to
-- the default 6-month window from their own purchase date.
UPDATE public.subscription_passes
SET expires_at = purchased_at + interval '6 months'
WHERE expires_at IS NULL;

ALTER TABLE public.subscription_passes
  ALTER COLUMN expires_at SET NOT NULL;

-- Seed the actual products this migration was written for — both real,
-- ready-to-use plans. Still fully editable afterward from
-- /admin/subscriptions like any other plan. Each entry covers the first
-- hour of one studio-by-the-hour booking only, same rule for both sizes.
INSERT INTO public.subscription_plans (name, total_entries, price, validity_months, active)
SELECT 'כרטיסיית 5 כניסות', 5, 750, 6, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_plans WHERE name = 'כרטיסיית 5 כניסות'
);
INSERT INTO public.subscription_plans (name, total_entries, price, validity_months, active)
SELECT 'כרטיסיית 10 כניסות', 10, 1300, 6, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_plans WHERE name = 'כרטיסיית 10 כניסות'
);

-- Audit trail for admin manual +/- entry adjustments on a pass (extending
-- or correcting it by hand, with a required note) — kept separate from the
-- entry history a redemption/refund already leaves via
-- bookings.subscription_pass_id, so this table only ever holds genuinely
-- manual changes, never ones a booking/cancellation already explains.
CREATE TABLE public.subscription_pass_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id uuid NOT NULL REFERENCES public.subscription_passes(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_pass_adjustments TO authenticated;
GRANT ALL ON public.subscription_pass_adjustments TO service_role;
ALTER TABLE public.subscription_pass_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_pass_adjustments_admin_select" ON public.subscription_pass_adjustments FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
-- Writes only via service_role (adminAdjustSubscriptionPassEntries), same
-- "no authenticated write policy" pattern as subscription_passes' own
-- admin-only write policy.

-- Atomically validates AND redeems one entry: status must be 'active',
-- entries_used < total_entries, and — per explicit requirement — the
-- SESSION DATE itself (not just "today") must fall within the pass's
-- validity window, since a studio booking is often made well ahead of the
-- session. Returns true/false instead of raising, so a caller can fall
-- back to normal pricing gracefully instead of erroring out. The UPDATE's
-- own row lock makes two concurrent redemptions on the same pass's last
-- entry resolve safely — the second sees entries_used already at
-- total_entries and returns false, never double-spending it.
create or replace function public.redeem_subscription_pass_entry(p_pass_id uuid, p_session_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.subscription_passes
  set entries_used = entries_used + 1
  where id = p_pass_id
    and status = 'active'
    and entries_used < total_entries
    and p_session_date <= expires_at::date
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;
revoke all on function public.redeem_subscription_pass_entry(uuid, date) from public;
grant execute on function public.redeem_subscription_pass_entry(uuid, date) to service_role;

-- Generic atomic +/- on a pass's entries_used, clamped to [0, total_entries]
-- in the single UPDATE statement (no read-then-write) — shared by the
-- cancellation refund (delta -1) and the admin's manual adjustment (any
-- delta, logged separately by the caller into
-- subscription_pass_adjustments). Returns the resulting entries_used.
create or replace function public.adjust_subscription_pass_entries(p_pass_id uuid, p_delta integer)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.subscription_passes
  set entries_used = greatest(0, least(total_entries, entries_used + p_delta))
  where id = p_pass_id
  returning entries_used;
$$;
revoke all on function public.adjust_subscription_pass_entries(uuid, integer) from public;
grant execute on function public.adjust_subscription_pass_entries(uuid, integer) to service_role;
