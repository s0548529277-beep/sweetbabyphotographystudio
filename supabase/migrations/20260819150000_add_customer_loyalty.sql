-- Per-customer loyalty program: admin enrolls specific customers with a
-- cashback percentage (optionally time-limited); the customer earns credit
-- toward future orders and applies it herself at checkout.
--
-- Deliberately its own table, not columns on public.profiles: profiles has
-- an UPDATE policy that lets a customer edit her own row from the browser
-- client (auth.uid() = id) — credit_balance/cashback_percent must never be
-- directly writable by the customer, only readable. Only service_role
-- (server functions) can write here; the SELECT policy below is read-only.
CREATE TABLE public.customer_loyalty (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cashback_percent integer NOT NULL DEFAULT 0,
  cashback_expires_at timestamptz,
  credit_balance numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.customer_loyalty TO authenticated;
GRANT ALL ON public.customer_loyalty TO service_role;
ALTER TABLE public.customer_loyalty ENABLE ROW LEVEL SECURITY;

-- Read-only for the customer herself (to show her balance) and for admins
-- (client management page). No INSERT/UPDATE/DELETE policy for
-- `authenticated` at all — every write goes through an admin-checked server
-- function using the service-role client, which bypasses RLS.
CREATE POLICY "customer_loyalty_select" ON public.customer_loyalty FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));
