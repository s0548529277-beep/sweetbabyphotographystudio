-- Same class of gap as credit_used before it: the coupon code and the
-- discount it actually gave were only ever recorded as free text inside
-- `notes` ("קוד קופון SWEET10 · הנחה ₪15"), never as structured columns.
-- That made it impossible for any other screen (like the post-checkout
-- summary/payment page) to show "a coupon was applied" without parsing
-- text — so summary.$type.$id.tsx just showed a bare total with no
-- indication a coupon or credit had been used at all.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS coupon_discount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS coupon_discount numeric(10,2) NOT NULL DEFAULT 0;
