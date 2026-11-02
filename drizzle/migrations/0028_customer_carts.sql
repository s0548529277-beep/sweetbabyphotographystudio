-- Server-side copy of each signed-in / guest customer's props cart (owner approved 2026-11-02):
-- the cart itself still lives in the browser (localStorage); the site mirrors it here a moment
-- after every change so (1) the owner can see what any customer has in her cart, via the admin
-- chat bot, and (2) the cart survives a cleared browser for a returning signed-in customer.
-- One row per user. A customer can only read/write her own row; admins can read every row.

CREATE TABLE IF NOT EXISTS public.customer_carts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_carts TO authenticated;
GRANT ALL ON public.customer_carts TO service_role;
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_carts_own_select" ON public.customer_carts;
CREATE POLICY "customer_carts_own_select" ON public.customer_carts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_carts_own_insert" ON public.customer_carts;
CREATE POLICY "customer_carts_own_insert" ON public.customer_carts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_carts_own_update" ON public.customer_carts;
CREATE POLICY "customer_carts_own_update" ON public.customer_carts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_carts_own_delete" ON public.customer_carts;
CREATE POLICY "customer_carts_own_delete" ON public.customer_carts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_carts_admin_read" ON public.customer_carts;
CREATE POLICY "customer_carts_admin_read" ON public.customer_carts
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
