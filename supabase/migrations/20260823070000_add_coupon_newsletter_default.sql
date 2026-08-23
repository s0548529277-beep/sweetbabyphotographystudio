-- Lets an admin pick which coupon (if any) the footer newsletter signup
-- advertises/reveals, instead of a percentage hardcoded in the component.
-- Only one coupon is meant to be the "current" newsletter default at a
-- time; that's enforced client-side in /admin/coupons (it clears any
-- previous true row before setting a new one), not by a DB constraint.
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS newsletter_default boolean NOT NULL DEFAULT false;
