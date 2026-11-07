-- Keep the e-mail typed into a props order, so the confirmation and the pickup
-- reminder go to it as well as to the account's own e-mail. Additive.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS contact_email text;
