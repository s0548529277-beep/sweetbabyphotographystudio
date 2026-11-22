-- Abandoned-order recovery: count of hold reminders already mailed (studio bookings: 2, props orders: 2).
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_reminders_sent integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hold_reminders_sent integer NOT NULL DEFAULT 0;
UPDATE public.bookings SET hold_reminders_sent = 1 WHERE abandoned_hold_reminder_sent_at IS NOT NULL AND hold_reminders_sent = 0;
