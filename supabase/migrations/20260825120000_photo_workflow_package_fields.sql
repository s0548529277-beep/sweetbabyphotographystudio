-- Package/shoot details on the client card: which package she booked (or a
-- custom one), the shoot date/location, how many photos are being edited,
-- and what the album/upgrades include. Lives on the workflow itself (not
-- derived from the booking) so it's editable and present the same way
-- whether the workflow came from a package='photography' booking or was
-- started manually/by email — a booking's session_date is only a
-- convenience default at creation time, not the source of truth afterward.

ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS session_date date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS package_type text,
  ADD COLUMN IF NOT EXISTS photos_to_edit int,
  ADD COLUMN IF NOT EXISTS album_upgrades text;

-- Backfill session_date from the linked booking for existing rows, as a
-- one-time default — still freely editable afterward.
UPDATE public.photo_client_workflows w
SET session_date = b.session_date
FROM public.bookings b
WHERE w.booking_id = b.id AND w.session_date IS NULL;
