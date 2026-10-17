-- Same personal/business tag as expenses.is_personal (see
-- 20261018000000_expenses_is_personal.sql), now on manual_income too — a
-- monthly bank/credit-card import can contain both deposits and charges,
-- and both need to be classifiable as personal or business, not just
-- expenses. Defaults to false so every pre-existing row keeps reading as
-- business.
alter table public.manual_income
  add column if not exists is_personal boolean not null default false;
