-- Keep the e-mail typed into a booking, so confirmations/reminders can go to it
-- even for guest or phone accounts that have no e-mail of their own. Additive.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS contact_email text;
