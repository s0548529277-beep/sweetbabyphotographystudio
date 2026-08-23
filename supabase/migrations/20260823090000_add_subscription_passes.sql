-- SWEET 10+1 style studio-visit packages. A "plan" is an admin-editable
-- template (name, how many entries, price) — see /admin/subscriptions.
-- A "pass" is one customer's purchased instance of a plan, with a running
-- entries_used counter. Purchases are handled manually off-site (bank
-- transfer today) — an admin creates the pass by hand after confirming
-- payment, there's no self-serve checkout for this yet.
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  total_entries integer NOT NULL CHECK (total_entries > 0),
  price numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_plans_admin_all" ON public.subscription_plans FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.subscription_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  plan_name text NOT NULL, -- snapshot so a later plan edit/delete doesn't rewrite history
  total_entries integer NOT NULL CHECK (total_entries > 0),
  entries_used integer NOT NULL DEFAULT 0 CHECK (entries_used >= 0),
  price_paid numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  purchased_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_passes TO authenticated;
GRANT ALL ON public.subscription_passes TO service_role;
ALTER TABLE public.subscription_passes ENABLE ROW LEVEL SECURITY;
-- A customer can see her own pass (for "הכרטיסייה שלי"); an admin sees all.
CREATE POLICY "subscription_passes_view_own_or_admin" ON public.subscription_passes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));
-- Writes (create a pass, and deducting an entry when a booking uses one)
-- only ever happen through the service-role client — admin creation from
-- /admin/subscriptions, entry deduction from inside placeBooking — same
-- write pattern as customer_loyalty, so no customer-facing write policy.
CREATE POLICY "subscription_passes_admin_write" ON public.subscription_passes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Which booking (if any) consumed a pass entry — lets the pass owner and
-- admin see the visit history, and lets booking cancellation refund the
-- entry (see adminSetStatus / cancelBooking).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS subscription_pass_id uuid REFERENCES public.subscription_passes(id) ON DELETE SET NULL;
