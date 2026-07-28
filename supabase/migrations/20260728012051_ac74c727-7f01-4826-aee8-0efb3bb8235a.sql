ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

ALTER TABLE public.item_availability
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_item_availability_booking ON public.item_availability(booking_id);

CREATE POLICY "owner reads own booking availability"
  ON public.item_availability FOR SELECT TO authenticated
  USING (booking_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = item_availability.booking_id AND b.user_id = auth.uid()
  ));

INSERT INTO public.coupons (code, discount_percent, discount_amount, active)
VALUES ('BABY10', 10, 0, true)
ON CONFLICT DO NOTHING;