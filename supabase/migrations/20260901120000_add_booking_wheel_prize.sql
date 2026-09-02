-- "Prize wheel" shown to eligible customers on their booking-confirmation
-- page (over-3-hour studio rentals, and any photography session/package
-- with Michal herself — see wheel-prizes.ts for the exact rule). One spin
-- per booking: wheel_prize is written once, on the first (and only) spin,
-- and its presence is what disables spinning again on a page reload.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS wheel_prize text,
  ADD COLUMN IF NOT EXISTS wheel_prize_won_at timestamptz;

NOTIFY pgrst, 'reload schema';
