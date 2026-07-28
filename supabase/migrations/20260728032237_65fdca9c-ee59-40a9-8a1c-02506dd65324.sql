CREATE TABLE IF NOT EXISTS public.page_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page text NOT NULL,
  url text NOT NULL,
  storage_path text,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_images_page_idx ON public.page_images (page, sort_order);
GRANT SELECT ON public.page_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_images TO authenticated;
GRANT ALL ON public.page_images TO service_role;
ALTER TABLE public.page_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "page_images_public_read" ON public.page_images;
CREATE POLICY "page_images_public_read" ON public.page_images FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "page_images_admin_write" ON public.page_images;
CREATE POLICY "page_images_admin_write" ON public.page_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));