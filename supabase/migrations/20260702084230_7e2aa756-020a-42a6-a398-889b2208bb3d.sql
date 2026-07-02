
DROP VIEW IF EXISTS public.item_busy_slots;

-- Restore a permissive read policy on non-sensitive availability info,
-- but rely on column-level revoke to hide order_id.
CREATE POLICY "anyone reads availability slots"
  ON public.item_availability FOR SELECT
  TO anon, authenticated
  USING (true);

-- Column-level: revoke SELECT on order_id from public roles.
REVOKE SELECT ON public.item_availability FROM anon, authenticated;
GRANT SELECT (id, item_id, date, slot_index, created_at) ON public.item_availability TO anon, authenticated;
GRANT INSERT ON public.item_availability TO authenticated;
GRANT ALL ON public.item_availability TO service_role;
