CREATE TABLE public.item_inspiration_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  url text NOT NULL,
  storage_path text,
  caption text,
  source text NOT NULL DEFAULT 'manual',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX item_inspiration_images_sku_idx ON public.item_inspiration_images (sku);

GRANT SELECT ON public.item_inspiration_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_inspiration_images TO authenticated;
GRANT ALL ON public.item_inspiration_images TO service_role;

ALTER TABLE public.item_inspiration_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_inspiration_public_read" ON public.item_inspiration_images
FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "item_inspiration_admin_write" ON public.item_inspiration_images
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));