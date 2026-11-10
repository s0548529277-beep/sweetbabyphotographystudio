-- Family room (the room booked for the client at Yaner Clinics): the hours that were booked for a studio booking.
-- Filled by the e-mail assistant from the confirmation mail Claude sends when it books. Additive.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS family_room_slots text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS family_room_booked_at timestamptz;
