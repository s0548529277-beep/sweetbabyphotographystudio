-- Links a newborn-package order to a REAL row in the same `bookings` table
-- every other studio-occupancy check (studioAvailability/bookingBlocksSlot)
-- already reads directly — this is what actually stops a customer from
-- renting the studio during a scheduled newborn session, independent of
-- whether the Google Calendar connector happens to be linked/working (that
-- sync stays too, as a secondary, visual-only convenience). Never set here
-- by a migration, only by newborn-orders.functions.ts once it actually
-- creates the blocking booking row.
ALTER TABLE public.newborn_package_orders
  ADD COLUMN blocking_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
