-- "Smart" guided proof-selection flow (select freely first, then narrow
-- down to the limit) is OPT-IN per client, per explicit request — most
-- clients still get today's plain single-pass grid unless the admin turns
-- this on for a specific one.
alter table public.photo_client_workflows
  add column if not exists guided_selection_enabled boolean not null default false;
