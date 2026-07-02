
-- Remove public read policy exposing order_id
DROP POLICY IF EXISTS "anyone reads availability" ON public.item_availability;

-- Owner can read their own availability rows
CREATE POLICY "owner reads own availability"
  ON public.item_availability FOR SELECT
  TO authenticated
  USING (
    order_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = item_availability.order_id AND o.user_id = auth.uid())
  );

-- Admin can read all
CREATE POLICY "admin reads availability"
  ON public.item_availability FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Public view: only non-sensitive slot info, no order_id
CREATE OR REPLACE VIEW public.item_busy_slots
WITH (security_invoker = on) AS
  SELECT item_id, date, slot_index
  FROM public.item_availability;

GRANT SELECT ON public.item_busy_slots TO anon, authenticated;

-- Ensure the view can bypass base-table SELECT RLS for non-sensitive columns:
-- since security_invoker=on relies on caller's RLS, we instead expose via a SECURITY DEFINER function.
-- Simpler: use a stable SECURITY DEFINER function returning the safe rows.
CREATE OR REPLACE FUNCTION public.get_item_busy_slots(_date date, _item_ids uuid[])
RETURNS TABLE(item_id uuid, slot_index int, date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ia.item_id, ia.slot_index, ia.date
  FROM public.item_availability ia
  WHERE ia.date = _date AND ia.item_id = ANY(_item_ids);
$$;

REVOKE ALL ON FUNCTION public.get_item_busy_slots(date, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_item_busy_slots(date, uuid[]) TO anon, authenticated;
