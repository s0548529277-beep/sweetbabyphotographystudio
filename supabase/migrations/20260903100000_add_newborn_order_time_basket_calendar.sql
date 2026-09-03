-- Adds shooting TIME (session_date alone had no time-of-day), whether the
-- קופת חולים "סל לידה" (birth-basket) benefit was used for this order, and
-- a Google Calendar event id so the order can be kept in sync with the
-- studio's real calendar the same way public bookings already are (see
-- bookings.google_event_id / finalizeBookingConfirmation) — never set here
-- by a migration, only by newborn-orders.functions.ts once it actually
-- creates/updates the calendar event.
ALTER TABLE public.newborn_package_orders
  ADD COLUMN session_time text,
  ADD COLUMN birth_basket_used boolean NOT NULL DEFAULT false,
  ADD COLUMN google_event_id text;

NOTIFY pgrst, 'reload schema';
