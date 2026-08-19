-- Tracks the Google Calendar event created for a props/equipment order.
-- Mirrors bookings.google_event_id. The calendar event (and Google's own
-- automatic invite email) is now created only in confirmOrderDeposit, after
-- payment is confirmed — this column lets that function detect it already
-- ran and avoid creating a duplicate event on a second call.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;
