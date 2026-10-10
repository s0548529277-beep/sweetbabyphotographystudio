-- Automatic, no-code-needed discount for a specific customer (e.g. a
-- colleague photographer an admin wants to always give a set % off) — set
-- per customer in /admin/clients, applied automatically at checkout
-- (placeBooking/placeOrder) with no coupon code to type, shown to the
-- customer herself on /account. Same read-only-for-customer /
-- admin-server-function-write pattern as cashback_percent on this table.
ALTER TABLE public.customer_loyalty ADD COLUMN IF NOT EXISTS fixed_discount_percent integer NOT NULL DEFAULT 0;
