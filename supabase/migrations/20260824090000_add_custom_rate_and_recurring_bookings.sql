-- A personal negotiated hourly rate for one customer's studio sessions —
-- admin-set on /admin/clients, applied automatically instead of the
-- standard price list whenever that customer books (see priceForBooking
-- in bookings.functions.ts). NULL = no special rate, use standard pricing.
ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS custom_hourly_rate numeric(10,2);

-- Groups the bookings created together by placeRecurringBooking (same
-- weekly time slot, booked N weeks at once) so they can be shown together
-- in the UI. Each row is still an independent booking otherwise — its own
-- status/deposit/cancellation.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS recurring_series_id uuid;
