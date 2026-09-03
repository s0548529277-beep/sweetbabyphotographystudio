-- "בניית אלבום מותאם אישית" — a customer-facing wizard: pick a shape+size
-- (real print dimensions, priced per page), pick a ready-made template
-- (admin-managed; its layout reuses the SAME slot-rect math already proven
-- in the free /collage-maker tool — see album-data.ts), then a SIMPLE
-- editor: upload a photo into each of the template's fixed slots and edit
-- its caption text — no freeform drag/resize canvas (explicit decision:
-- "עורך פשוט קודם", 2026-09-03). Feeds into the existing orders/order_items
-- flow (one order_item per album, item_id NULL since it's not a catalog
-- item) rather than a parallel checkout system.

CREATE TABLE public.album_shapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, -- panoramic | square | portrait
  name_he text NOT NULL,
  name_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

GRANT SELECT ON public.album_shapes TO anon, authenticated;
GRANT ALL ON public.album_shapes TO service_role;
ALTER TABLE public.album_shapes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_shapes_select" ON public.album_shapes FOR SELECT TO anon, authenticated
  USING (is_active = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_shapes_admin_write" ON public.album_shapes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.album_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_id uuid NOT NULL REFERENCES public.album_shapes(id) ON DELETE CASCADE,
  label_he text NOT NULL, -- מיני / קטן / בינוני / גדול
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
GRANT ALL ON public.album_sizes TO service_role;
ALTER TABLE public.album_sizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_sizes_select" ON public.album_sizes FOR SELECT TO anon, authenticated
  USING (is_active = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_sizes_admin_write" ON public.album_sizes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- template_data shape (JSON, validated in app code, not in SQL):
--   { pages: [ { layoutId: string, photoCount: number, hasCaption: boolean } ] }
-- layoutId is one of collage-data.ts's getLayoutVariants ids ("featured" |
-- "grid" | "strip" | "mosaic" | "scatter") for that page's photoCount —
-- reusing that already-built/tested slot math instead of a bespoke
-- freeform template designer, per the same "simple first" decision above.
CREATE TABLE public.album_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_id uuid NOT NULL REFERENCES public.album_shapes(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text, -- חתונה / ניובורן / משפחה / בר-מצווה / כללי
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

-- One row per submitted album design — linked to a real order/order_item
-- (existing checkout flow) so it shows up alongside every other purchase
-- rather than a parallel system. design_json mirrors template_data's page
-- structure with each slot's uploaded photo path + each page's caption
-- text filled in — the admin order-detail view renders it read-only from
-- this, no separate "preview image" render pipeline needed for phase 1.
CREATE TABLE public.album_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shape_id uuid REFERENCES public.album_shapes(id) ON DELETE SET NULL,
  size_id uuid REFERENCES public.album_sizes(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.album_templates(id) ON DELETE SET NULL,
  pages integer NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  design_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.album_orders TO authenticated;
GRANT ALL ON public.album_orders TO service_role;
ALTER TABLE public.album_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_orders_select" ON public.album_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "album_orders_insert" ON public.album_orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER album_orders_set_updated_at
  BEFORE UPDATE ON public.album_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Customer-uploaded photos for an in-progress/submitted album design — a
-- NEW private bucket (not the public "items" catalog bucket, and not
-- "receipts" which is payment-proof-specific): personal family photos, one
-- folder per uploader, same auth.uid()-prefixed-path pattern "receipts"
-- already uses. `on conflict do nothing` since bucket creation via SQL
-- isn't exercised anywhere else in this repo's migration history (every
-- existing bucket here was created out-of-band via the Lovable Cloud
-- storage UI) — if this INSERT turns out not to be permitted in this
-- project's migration role, create the bucket manually once via Lovable
-- Cloud → Storage (name: album-photos, private) and everything below still
-- applies unchanged.
INSERT INTO storage.buckets (id, name, public)
VALUES ('album-photos', 'album-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "album_photos_owner_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'album-photos' AND (auth.uid()::text = (storage.foldername(name))[1] OR private.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "album_photos_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'album-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "album_photos_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'album-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "album_photos_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'album-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Seed shapes + sizes from the studio's own price list, per the spec
-- handed to this feature. NOTE the spec itself flagged an inconsistency
-- for מרובע/קטן (15x30 vs 20x40 across two source images) — seeded here as
-- 15x30 (the panoramic/עמוד ladder's own "קטן" step is the smaller of each
-- pair, so 15x30 is the internally-consistent choice) but this needs a
-- real price-list check; editable at /admin/album-templates either way.
INSERT INTO public.album_shapes (slug, name_he, name_en, sort_order) VALUES
  ('panoramic', 'פנורמי', 'Panoramic', 1),
  ('square', 'מרובע', 'Square', 2),
  ('portrait', 'עמוד', 'Portrait', 3);

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
  ON v.shape_slug = s.slug;
