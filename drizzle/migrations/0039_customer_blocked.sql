-- Admin can block a customer from placing prop orders and studio bookings (they just see a generic "technical problem"). Additive.
ALTER TABLE public.customer_loyalty ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer_loyalty ADD COLUMN IF NOT EXISTS blocked_note text;
