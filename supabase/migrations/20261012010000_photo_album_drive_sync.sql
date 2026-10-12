-- Per-client album Google Drive backup/share — per explicit request:
-- uploads the final edited album to the studio owner's own Drive as a
-- backup, AND gives her a shareable link she can choose to hand the client.
-- Both stored on the workflow so the admin page can show "already synced,
-- here's the link" instead of re-uploading blindly on every visit.
alter table public.photo_client_workflows
  add column if not exists drive_folder_url text,
  add column if not exists drive_synced_at timestamptz;
