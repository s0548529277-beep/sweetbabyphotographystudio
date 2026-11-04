-- Owner request 2026-11-04: outdoor clients get the same gallery system as newborn clients
-- (proof photos, selection, notes, edited album, ZIP downloads, unlock receipt, album details,
-- step trackers, email-code gate). ADDITIVE ONLY: new columns on outdoor_package_orders and two
-- new tables that mirror newborn_order_images / newborn_gallery_access. Nothing existing changes.

ALTER TABLE public.outdoor_package_orders
  ADD COLUMN IF NOT EXISTS access_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  ADD COLUMN IF NOT EXISTS gallery_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS gallery_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_nudge_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS proofs_selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_proof_selections integer,
  ADD COLUMN IF NOT EXISTS guided_selection_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_photos_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_photos_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_receipt_path text,
  ADD COLUMN IF NOT EXISTS unlock_receipt_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS proofs_zip_downloads integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited_zip_downloads integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drive_folder_url text,
  ADD COLUMN IF NOT EXISTS drive_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_step integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS production_step integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS date_deposit_at timestamptz,
  ADD COLUMN IF NOT EXISTS shoot_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS photos_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS editing_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS album_design_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS printing_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS album_child_name text,
  ADD COLUMN IF NOT EXISTS album_birth_weight text,
  ADD COLUMN IF NOT EXISTS album_birth_time text,
  ADD COLUMN IF NOT EXISTS album_birth_date date,
  ADD COLUMN IF NOT EXISTS album_hospital text,
  ADD COLUMN IF NOT EXISTS album_caption_language text,
  ADD COLUMN IF NOT EXISTS album_notes text,
  ADD COLUMN IF NOT EXISTS album_details_submitted_at timestamptz;

UPDATE public.outdoor_package_orders SET access_token = encode(gen_random_bytes(16), 'hex') WHERE access_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS outdoor_package_orders_access_token_key ON public.outdoor_package_orders (access_token);

CREATE TABLE IF NOT EXISTS public.outdoor_order_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.outdoor_package_orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('proof','edited')),
  storage_path text NOT NULL,
  image_url text NOT NULL,
  selected boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  original_storage_path text,
  original_image_url text,
  watermarked boolean NOT NULL DEFAULT false,
  file_name text,
  client_note text
);
CREATE INDEX IF NOT EXISTS outdoor_order_images_order_idx ON public.outdoor_order_images (order_id, kind, sort_order);
ALTER TABLE public.outdoor_order_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outdoor_order_images_admin_all ON public.outdoor_order_images;
CREATE POLICY outdoor_order_images_admin_all ON public.outdoor_order_images FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.outdoor_order_images FROM anon;

CREATE TABLE IF NOT EXISTS public.outdoor_gallery_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.outdoor_package_orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('code','device')),
  secret_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  used_at timestamptz,
  last_used_at timestamptz,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outdoor_gallery_access_order_idx ON public.outdoor_gallery_access (order_id, kind);
ALTER TABLE public.outdoor_gallery_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outdoor_gallery_access FROM anon, authenticated;
