-- "בניית אלבום מותאם אישית" (custom album builder), ported 2026-10-27 from
-- the Sept 3 branch claude/email-search-rpn6jn (its supabase/ migration was
-- never applied). Customer wizard at /album-builder (hidden, noindex) →
-- admin at /admin/albums.
--
-- Differences from the old branch (on purpose):
--  * album_orders is STANDALONE — it no longer creates rows in
--    orders/order_items. Those are the props-rental orders and feed finance,
--    cashback, pickup reminders etc.; an album there would be mis-counted.
--  * album_orders.newborn_order_id lets the admin link an album to an
--    existing newborn_package_orders row (reuse, no duplicate client data).
--  * album_examples: admin-only list of sample albums (e.g. links to the
--    owner's own Drive files). Rows are kept in the DB only, not in this
--    public repo, because file names may contain client names.

CREATE TABLE IF NOT EXISTS public.album_shapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_he text NOT NULL,
  name_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.album_shapes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.album_shapes TO authenticated;
GRANT ALL ON public.album_shapes TO service_role;
ALTER TABLE public.album_shapes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_shapes_select" ON public.album_shapes FOR SELECT TO anon, authenticated
  USING (is_active = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_shapes_admin_write" ON public.album_shapes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.album_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_id uuid NOT NULL REFERENCES public.album_shapes(id) ON DELETE CASCADE,
  label_he text NOT NULL,
  width_cm numeric NOT NULL,
  height_cm numeric NOT NULL,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  price_per_extra_page numeric(10,2) NOT NULL DEFAULT 0,
  min_pages integer NOT NULL DEFAULT 20,
  max_pages integer NOT NULL DEFAULT 60,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.album_sizes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.album_sizes TO authenticated;
GRANT ALL ON public.album_sizes TO service_role;
ALTER TABLE public.album_sizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_sizes_select" ON public.album_sizes FOR SELECT TO anon, authenticated
  USING (is_active = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_sizes_admin_write" ON public.album_sizes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- template_data: { pages: [ { layoutId, photoCount, hasCaption } ] }
-- layoutId = one of collage-data.ts getLayoutVariants(photoCount) ids.
CREATE TABLE IF NOT EXISTS public.album_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_id uuid NOT NULL REFERENCES public.album_shapes(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  thumbnail_url text,
  template_data jsonb NOT NULL,
  min_pages integer,
  max_pages integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.album_templates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.album_templates TO authenticated;
GRANT ALL ON public.album_templates TO service_role;
ALTER TABLE public.album_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_templates_select" ON public.album_templates FOR SELECT TO anon, authenticated
  USING (is_active = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_templates_admin_write" ON public.album_templates FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER album_templates_set_updated_at
  BEFORE UPDATE ON public.album_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- status: new | in_design | sent_for_approval | approved | printing | delivered | cancelled
CREATE TABLE IF NOT EXISTS public.album_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name text,
  contact_phone text,
  contact_email text,
  shape_id uuid REFERENCES public.album_shapes(id) ON DELETE SET NULL,
  size_id uuid REFERENCES public.album_sizes(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.album_templates(id) ON DELETE SET NULL,
  summary text,
  pages integer NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  design_json jsonb NOT NULL,
  customer_notes text,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  newborn_order_id uuid REFERENCES public.newborn_package_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.album_orders TO authenticated;
GRANT ALL ON public.album_orders TO service_role;
ALTER TABLE public.album_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_orders_select" ON public.album_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_orders_insert" ON public.album_orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'new' AND admin_notes IS NULL AND newborn_order_id IS NULL);
CREATE POLICY "album_orders_admin_update" ON public.album_orders FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_orders_admin_delete" ON public.album_orders FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER album_orders_set_updated_at
  BEFORE UPDATE ON public.album_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.album_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL,
  category text,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.album_examples TO authenticated;
GRANT ALL ON public.album_examples TO service_role;
ALTER TABLE public.album_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_examples_admin_all" ON public.album_examples FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Private bucket for customers' album photos, one folder per uploader.
INSERT INTO storage.buckets (id, name, public)
VALUES ('album-photos', 'album-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "album_photos_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "album_photos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "album_photos_owner_delete" ON storage.objects;
CREATE POLICY "album_photos_owner_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'album-photos' AND (auth.uid()::text = (storage.foldername(name))[1] OR private.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "album_photos_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'album-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "album_photos_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'album-photos' AND (auth.uid()::text = (storage.foldername(name))[1] OR private.has_role(auth.uid(), 'admin'::app_role)));

-- Starting shapes/sizes/prices from the Sept 3 branch (its source price
-- list had an inconsistency for מרובע/קטן: 15x30 vs 20x40). ALL prices are
-- placeholders for the owner to confirm at /admin/albums.
INSERT INTO public.album_shapes (slug, name_he, name_en, sort_order) VALUES
  ('panoramic', 'פנורמי', 'Panoramic', 1),
  ('square', 'מרובע', 'Square', 2),
  ('portrait', 'עמוד', 'Portrait', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.album_sizes (shape_id, label_he, width_cm, height_cm, base_price, price_per_extra_page, min_pages, max_pages, sort_order)
SELECT s.id, v.label_he, v.width_cm, v.height_cm, v.base_price, v.price_per_extra_page, v.min_pages, v.max_pages, v.sort_order
FROM public.album_shapes s
JOIN (VALUES
  ('panoramic', 'מיני', 11, 30, 250, 15, 20, 60, 1),
  ('panoramic', 'קטן', 15, 40, 320, 18, 20, 60, 2),
  ('panoramic', 'בינוני', 21, 56, 420, 22, 20, 60, 3),
  ('panoramic', 'גדול', 30, 80, 560, 28, 20, 60, 4),
  ('square', 'קטן', 15, 30, 300, 16, 20, 60, 1),
  ('square', 'בינוני', 25, 50, 480, 24, 20, 60, 2),
  ('square', 'גדול', 30, 60, 620, 30, 20, 60, 3),
  ('portrait', 'קטן', 20, 30, 340, 18, 20, 60, 1),
  ('portrait', 'בינוני', 30, 45, 520, 26, 20, 60, 2)
) AS v(shape_slug, label_he, width_cm, height_cm, base_price, price_per_extra_page, min_pages, max_pages, sort_order)
  ON v.shape_slug = s.slug
WHERE NOT EXISTS (SELECT 1 FROM public.album_sizes);

-- One starter newborn template so the wizard isn't empty (admin can edit/hide).
INSERT INTO public.album_templates (shape_id, name, category, template_data, min_pages, max_pages, sort_order)
SELECT s.id, 'ניו-בורן קלאסי', 'ניו-בורן',
  '{"pages":[{"layoutId":"featured","photoCount":1,"hasCaption":true},{"layoutId":"grid","photoCount":2,"hasCaption":false},{"layoutId":"featured","photoCount":3,"hasCaption":false},{"layoutId":"grid","photoCount":4,"hasCaption":false},{"layoutId":"featured","photoCount":1,"hasCaption":true}]}'::jsonb,
  20, 60, 1
FROM public.album_shapes s
WHERE s.slug = 'square' AND NOT EXISTS (SELECT 1 FROM public.album_templates);
