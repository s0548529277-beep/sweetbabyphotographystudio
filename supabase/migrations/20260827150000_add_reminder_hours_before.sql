-- Replaces the old fixed automatic 12h/4h reminders with an opt-in,
-- customer-chosen "how many hours before" reminder, set on the deposit/
-- checkout screen. NULL = no reminder wanted (the default — nobody gets one
-- unless she asks). reminder_sent_at (already exists on both tables) is
-- reused as the single "has it been sent" marker.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_hours_before numeric;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reminder_hours_before numeric;

NOTIFY pgrst, 'reload schema';
