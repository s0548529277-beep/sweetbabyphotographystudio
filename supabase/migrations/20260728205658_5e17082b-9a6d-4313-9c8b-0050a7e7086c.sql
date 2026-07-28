ALTER TABLE public.page_images ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE TABLE public.manual_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL DEFAULT 'אחר',
  received_on date NOT NULL DEFAULT (now()::date),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_income TO authenticated;
GRANT ALL ON public.manual_income TO service_role;

ALTER TABLE public.manual_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view manual income" ON public.manual_income
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));
CREATE POLICY "Admins can insert manual income" ON public.manual_income
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));
CREATE POLICY "Admins can update manual income" ON public.manual_income
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));
CREATE POLICY "Admins can delete manual income" ON public.manual_income
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));

CREATE TRIGGER manual_income_set_updated_at BEFORE UPDATE ON public.manual_income
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();