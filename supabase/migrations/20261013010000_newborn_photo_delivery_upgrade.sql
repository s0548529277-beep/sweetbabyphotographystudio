-- Replicates the photo_client_* photo-delivery upgrade (full-quality
-- original, watermark flag, selection limit, guided selection, Drive
-- backup/share) onto the separate newborn-package flow — per explicit
-- request, same features, kept on its own tables per this flow's existing
-- deliberate separation from photo_client_workflows/photo_client_images
-- (see newborn-orders.functions.ts's own top-of-file comment).
--
-- proofs_selected_at already exists and already serves as this flow's
-- "selection submitted/locked" timestamp (set by
-- finishNewbornProofSelectionByToken) — reused as-is, no duplicate column.
alter table public.newborn_package_orders
  add column if not exists max_proof_selections integer,
  add column if not exists guided_selection_enabled boolean not null default false,
  add column if not exists drive_folder_url text,
  add column if not exists drive_synced_at timestamptz;

alter table public.newborn_order_images
  add column if not exists original_storage_path text,
  add column if not exists original_image_url text,
  add column if not exists watermarked boolean not null default false;
