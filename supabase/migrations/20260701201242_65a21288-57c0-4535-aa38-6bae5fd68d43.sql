
DROP POLICY IF EXISTS "authenticated inserts availability" ON public.item_availability;
CREATE POLICY "user inserts availability for own order"
  ON public.item_availability FOR INSERT TO authenticated
  WITH CHECK (
    order_id IS NULL AND false -- disallow direct client inserts w/o order
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = item_availability.order_id AND o.user_id = auth.uid()
    )
  );
