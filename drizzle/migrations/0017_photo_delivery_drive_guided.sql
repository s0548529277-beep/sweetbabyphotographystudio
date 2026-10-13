alter table public.photo_client_workflows
  add column if not exists max_proof_selections integer,
  add column if not exists proof_selection_submitted_at timestamptz,
  add column if not exists drive_folder_url text,
  add column if not exists drive_synced_at timestamptz,
  add column if not exists guided_selection_enabled boolean not null default false;
alter table public.photo_client_images
  add column if not exists original_storage_path text,
  add column if not exists original_image_url text,
  add column if not exists watermarked boolean not null default false;
NOTIFY pgrst, 'reload schema';