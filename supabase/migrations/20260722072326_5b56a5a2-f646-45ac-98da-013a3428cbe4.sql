-- 1) Fix multi-stock UNIQUE constraint on item_availability
ALTER TABLE public.item_availability
  DROP CONSTRAINT IF EXISTS item_availability_item_id_date_slot_index_key;
ALTER TABLE public.item_availability
  DROP CONSTRAINT IF EXISTS item_availability_range_slot_key;
ALTER TABLE public.item_availability
  ADD CONSTRAINT item_availability_range_slot_key
  UNIQUE (item_id, start_date, end_date, slot_index);

-- 2) Studio intake form storage
CREATE TABLE IF NOT EXISTS public.studio_intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.studio_intake_forms TO authenticated;
GRANT ALL ON public.studio_intake_forms TO service_role;
ALTER TABLE public.studio_intake_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own intake" ON public.studio_intake_forms;
CREATE POLICY "users insert own intake" ON public.studio_intake_forms
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users read own intake" ON public.studio_intake_forms;
CREATE POLICY "users read own intake" ON public.studio_intake_forms
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));