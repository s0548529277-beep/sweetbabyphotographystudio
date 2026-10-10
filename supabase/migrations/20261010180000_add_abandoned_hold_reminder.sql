-- Lets runDueAbandonedHoldReminders (bookings.functions.ts) mark a pending,
-- untouched booking hold as already-reminded, so the same hold never gets
-- the "your spot is still held" email twice before it either converts
-- (deposit paid) or expires (PENDING_HOLD_MINUTES, availability.server.ts).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS abandoned_hold_reminder_sent_at timestamptz;
