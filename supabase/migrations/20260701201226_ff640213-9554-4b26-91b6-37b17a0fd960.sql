
-- 1. Leads (intake form) - can be anonymous
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  referral_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can insert lead" ON public.leads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin can read leads" ON public.leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Studio bookings (Track A)
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slots INT NOT NULL,
  package TEXT NOT NULL DEFAULT 'regular',
  price NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 90,
  deposit_status TEXT NOT NULL DEFAULT 'pending',
  deposit_receipt_url TEXT,
  balance_method TEXT,
  balance_amount NUMERIC(10,2),
  overtime_minutes INT DEFAULT 0,
  overtime_charge NUMERIC(10,2) DEFAULT 0,
  cancellation_charge NUMERIC(10,2) DEFAULT 0,
  terms_accepted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
GRANT SELECT ON public.bookings TO anon;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user owns booking" ON public.bookings FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user inserts own booking" ON public.bookings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user updates own booking" ON public.bookings FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin deletes booking" ON public.bookings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "anon reads busy slots" ON public.bookings FOR SELECT TO anon USING (true);
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Extend items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS stock_quantity INT NOT NULL DEFAULT 1;

-- 4. Extend orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS track TEXT DEFAULT 'props',
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) DEFAULT 90,
  ADD COLUMN IF NOT EXISTS deposit_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS deposit_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS balance_method TEXT,
  ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS camera_model TEXT,
  ADD COLUMN IF NOT EXISTS session_date DATE,
  ADD COLUMN IF NOT EXISTS overtime_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_charge NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_charge NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- 5. Item availability (unique lock per date)
CREATE TABLE public.item_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  slot_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, date, slot_index)
);
GRANT SELECT ON public.item_availability TO anon, authenticated;
GRANT INSERT, DELETE ON public.item_availability TO authenticated;
GRANT ALL ON public.item_availability TO service_role;
ALTER TABLE public.item_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads availability" ON public.item_availability FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated inserts availability" ON public.item_availability FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin deletes availability" ON public.item_availability FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. Studio closures / overrides
CREATE TABLE public.studio_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  closed BOOLEAN NOT NULL DEFAULT false,
  open_time TIME,
  close_time TIME,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.studio_closures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.studio_closures TO authenticated;
GRANT ALL ON public.studio_closures TO service_role;
ALTER TABLE public.studio_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read closures" ON public.studio_closures FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manages closures" ON public.studio_closures FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
