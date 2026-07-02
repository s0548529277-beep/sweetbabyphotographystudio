
DROP FUNCTION IF EXISTS public.get_item_busy_slots(date, uuid[]);

-- Recreate view without security_invoker so it runs with owner privileges
-- and bypasses RLS on the base table, but only exposes non-sensitive columns.
DROP VIEW IF EXISTS public.item_busy_slots;
CREATE VIEW public.item_busy_slots AS
  SELECT item_id, date, slot_index
  FROM public.item_availability;

GRANT SELECT ON public.item_busy_slots TO anon, authenticated;
