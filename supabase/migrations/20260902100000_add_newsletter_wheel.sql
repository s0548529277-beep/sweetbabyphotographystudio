-- The newsletter popup's "spin the wheel" discount, tied to actually
-- checking the newsletter opt-in checkbox (not just registering an
-- account) — see newsletter-wheel.functions.ts. One spin per email, ever:
-- wheel_spun_at being set is what gates a re-spin.
ALTER TABLE public.newsletter_signups
  ADD COLUMN IF NOT EXISTS wheel_prize_sequence jsonb,
  ADD COLUMN IF NOT EXISTS wheel_coupon_code text,
  ADD COLUMN IF NOT EXISTS wheel_spun_at timestamptz;

NOTIFY pgrst, 'reload schema';
