-- "Download all the proof photos without the watermark" — per explicit
-- request, gated behind a 150₪ add-on: either the client uploads a
-- payment receipt and the admin approves it, or the admin pre-approves it
-- herself in advance (no receipt needed). Same gate added to both the
-- main photo_client_workflows flow and the separate newborn_package_orders
-- flow, per this session's established pattern of keeping the two flows
-- on parallel-but-separate schemas.
alter table public.photo_client_workflows
  add column if not exists all_photos_unlocked boolean not null default false,
  add column if not exists unlock_receipt_path text,
  add column if not exists unlock_receipt_submitted_at timestamptz;

alter table public.newborn_package_orders
  add column if not exists all_photos_unlocked boolean not null default false,
  add column if not exists unlock_receipt_path text,
  add column if not exists unlock_receipt_submitted_at timestamptz;