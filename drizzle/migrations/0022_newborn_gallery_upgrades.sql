-- Newborn gallery upgrades (2026-10-25, Claude chat, at the owner's request):
-- file names + client notes per photo, ZIP download counters (limit 2 each),
-- gallery sent/viewed/nudge stamps, extra photos sold at selection.
ALTER TABLE public.newborn_order_images ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.newborn_order_images ADD COLUMN IF NOT EXISTS client_note text;
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS proofs_zip_downloads integer NOT NULL DEFAULT 0;
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS edited_zip_downloads integer NOT NULL DEFAULT 0;
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS gallery_sent_at timestamptz;
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS client_viewed_at timestamptz;
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS view_nudge_sent_at timestamptz;
ALTER TABLE public.newborn_package_orders ADD COLUMN IF NOT EXISTS extra_photos_count integer NOT NULL DEFAULT 0;
-- Galleries that were already sent/opened before this change must not get a nudge.
UPDATE public.newborn_package_orders SET client_viewed_at = COALESCE(client_viewed_at, now()) WHERE gallery_opened_at IS NOT NULL OR proofs_selected_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
