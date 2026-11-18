-- Where a newborn session takes place: 'studio' (blocks studio hours + family room)
-- or 'home' (client's home: no studio calendar event, no studio block).
alter table public.newborn_package_orders add column if not exists session_place text not null default 'studio';
alter table public.newborn_package_orders drop constraint if exists newborn_session_place_chk;
alter table public.newborn_package_orders add constraint newborn_session_place_chk check (session_place in ('studio','home'));
