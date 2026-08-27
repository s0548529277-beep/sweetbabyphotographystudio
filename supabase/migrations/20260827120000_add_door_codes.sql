-- Stores the TTLock temporary door passcode issued per confirmed studio
-- booking / props order, so it's visible on the record itself (admin, and
-- for revoking it if the booking is later cancelled) instead of only ever
-- existing inside a sent email.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS door_code text,
  ADD COLUMN IF NOT EXISTS ttlock_keyboard_pwd_id bigint,
  ADD COLUMN IF NOT EXISTS ttlock_lock_id bigint;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS door_code text,
  ADD COLUMN IF NOT EXISTS ttlock_keyboard_pwd_id bigint,
  ADD COLUMN IF NOT EXISTS ttlock_lock_id bigint;

NOTIFY pgrst, 'reload schema';
