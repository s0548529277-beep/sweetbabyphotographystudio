-- Recurring weekly series (placeRecurringBooking) is opt-in per customer,
-- not open to everyone — the admin explicitly approves a customer on
-- /admin/clients before she can use it.
ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS can_book_recurring boolean NOT NULL DEFAULT false;
