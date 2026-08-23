-- Lets a coupon be minted as single-use and tied to one email — used for
-- the newsletter welcome discount: instead of everyone sharing the same
-- code, each new subscriber gets their own code (cloned from whichever
-- coupon is flagged newsletter_default) that only works once.
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS single_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_to_email text;
