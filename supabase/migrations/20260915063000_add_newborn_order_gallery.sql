-- A genuinely separate proof/selection gallery for newborn-photography
-- clients, per explicit request: NOT the general photo_client_workflows /
-- photo_client_images system used elsewhere on the site (that one stays
-- for other client types) — this is Michal's own business, so her clients
-- get their own table, keyed to newborn_package_orders, never touching the
-- general system at all.
--
-- Client access is token-based (access_token), not Supabase Auth: the
-- client never needs a site account or to log in — she just gets a private
-- link by email. All reads/writes for that link go through server
-- functions using the service-role client (see newborn-orders.functions.ts),
-- which check the token themselves, so no anonymous RLS policy is needed
-- here at all — every policy below stays admin-only, same as the parent
-- table.
ALTER TABLE public.newborn_package_orders
  ADD COLUMN IF NOT EXISTS access_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  ADD COLUMN IF NOT EXISTS contract_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS proofs_selected_at timestamptz;

CREATE TABLE public.newborn_order_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.newborn_package_orders(id) ON DELETE CASCADE,
  -- 'proof' = full-quality watermarked images the client picks from.
  -- 'edited' = final full-quality images, only shown once she uploads them.
  kind text NOT NULL CHECK (kind IN ('proof', 'edited')),
  storage_path text,
  image_url text NOT NULL,
  selected boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.newborn_order_images TO service_role;
ALTER TABLE public.newborn_order_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newborn_order_images_admin_all" ON public.newborn_order_images FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS newborn_order_images_order_id_idx ON public.newborn_order_images(order_id);

NOTIFY pgrst, 'reload schema';
