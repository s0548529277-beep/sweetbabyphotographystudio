-- Client-gallery access check (owner request 2026-10-30, ChikTime-style):
-- a one-time code mailed to the client unlocks the gallery on a device,
-- which then keeps a random device key. Rows hold only SHA-256 hashes.
-- Service role only: RLS on, no policies.
create table if not exists public.newborn_gallery_access (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.newborn_package_orders(id) on delete cascade,
  kind text not null check (kind in ('code', 'device')),
  secret_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz,
  used_at timestamptz,
  last_used_at timestamptz,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists newborn_gallery_access_order_kind_idx
  on public.newborn_gallery_access (order_id, kind, created_at desc);

alter table public.newborn_gallery_access enable row level security;
