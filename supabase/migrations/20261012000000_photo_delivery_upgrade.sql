-- Photo-delivery upgrade (proof selection + final download): per explicit
-- request — a selection limit, a full-quality original kept alongside the
-- (optionally compressed/watermarked) display copy, and a record of when a
-- client submitted her final proof picks (drives the admin notification +
-- the client confirmation email, and stops her from re-toggling after
-- submitting).

alter table public.photo_client_workflows
  add column if not exists max_proof_selections integer,
  add column if not exists proof_selection_submitted_at timestamptz;

-- original_* holds the untouched, full-resolution upload — used for the
-- "download full quality" ZIP. image_url/storage_path stay the DISPLAY
-- copy (optionally compressed and/or watermarked) shown in the gallery
-- grid, exactly as before. Nullable: existing rows have only ever had one
-- copy, so they simply fall back to it (see photo-clients.functions.ts).
alter table public.photo_client_images
  add column if not exists original_storage_path text,
  add column if not exists original_image_url text,
  add column if not exists watermarked boolean not null default false;
