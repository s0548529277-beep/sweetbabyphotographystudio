-- Self-serve card pass purchases (purchase_source='online_card') used to
-- activate immediately on the customer's own "I paid" confirmation. Per
-- direct request, that's now a two-step flow: the purchase creates a
-- 'pending_approval' pass (unusable — every real read of subscription_passes
-- already filters status='active', so this blocks it for free with no other
-- code changes needed) until the studio owner approves it in
-- /admin/subscriptions (adminApproveSubscriptionPass, admin-subscriptions.
-- functions.ts), which flips it to 'active'.
ALTER TABLE public.subscription_passes DROP CONSTRAINT IF EXISTS subscription_passes_status_check;
ALTER TABLE public.subscription_passes
  ADD CONSTRAINT subscription_passes_status_check CHECK (status IN ('active', 'cancelled', 'pending_approval'));

ALTER TABLE public.subscription_passes ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Repeated "please approve this" nudge to the studio owner while a pass sits
-- in pending_approval — see runDuePendingPassApprovalNudges
-- (subscription-purchase.functions.ts), run from the same periodic
-- /api/send-booking-reminders cron hit as every other reminder job.
-- approval_nudge_count caps how many times it fires (MAX_APPROVAL_NUDGES);
-- approval_nudge_sent_at is when the last one went out, so the next is only
-- due APPROVAL_NUDGE_INTERVAL_HOURS later.
ALTER TABLE public.subscription_passes ADD COLUMN IF NOT EXISTS approval_nudge_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.subscription_passes ADD COLUMN IF NOT EXISTS approval_nudge_sent_at timestamptz;
