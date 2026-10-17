-- Tracks whether a studio booking's remaining balance (bookings.balance_amount
-- — the gap between the deposit paid at booking time and the full price,
-- normally collected in person at the session) was actually collected.
-- Nothing in this app ever updated balance_amount back to 0 once that
-- happened, so there was no way to tell a real open balance apart from one
-- already paid in person — this column is admin-marked (see
-- /admin/finance's "חובות לקוחות" section) once she's collected it.
-- Defaults to false so every pre-existing booking with a balance reads as
-- outstanding until she goes through and marks the already-collected ones.
alter table public.bookings
  add column if not exists balance_paid boolean not null default false;
