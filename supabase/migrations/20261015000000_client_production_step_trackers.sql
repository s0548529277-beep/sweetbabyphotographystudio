-- Two independent visual progress trackers, shown as a breadcrumb at the
-- top of the gallery — "pink" is the CLIENT's own journey (what she sees
-- on her own gallery page), "gold" is the photographer's internal
-- production pipeline (admin-only). Deliberately separate from the
-- existing `stage` column, which keeps driving actual logic (proof-
-- selection locking etc.) — these two are purely a manually-advanced
-- visual indicator. Same two columns added to both the main
-- photo_client_workflows flow and the separate newborn_package_orders
-- flow, per this session's established pattern.
alter table public.photo_client_workflows
  add column if not exists client_step int not null default 1 check (client_step between 1 and 4),
  add column if not exists production_step int not null default 1 check (production_step between 1 and 6);

alter table public.newborn_package_orders
  add column if not exists client_step int not null default 1 check (client_step between 1 and 4),
  add column if not exists production_step int not null default 1 check (production_step between 1 and 6);
