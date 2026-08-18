-- Tracks whether the automatic "12 hours before the session" reminder
-- email has already been sent for a booking, so the reminder job never
-- double-sends. NULL = not sent yet.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Speeds up the reminder job's scan for bookings that still need a
-- reminder (it only ever looks at rows where reminder_sent_at IS NULL).
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_pending
  ON public.bookings (session_date, start_time)
  WHERE reminder_sent_at IS NULL;
