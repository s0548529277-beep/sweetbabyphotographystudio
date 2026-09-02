-- Column-level protection for financial/status fields on orders & bookings.
create or replace function public.guard_financial_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins and server-side (service_role) calls may change anything.
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;
  if auth.uid() is not null and exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  ) then
    return new;
  end if;

  -- Reject changes to financial / status columns for everyone else.
  if tg_table_name = 'orders' then
    if new.deposit_status is distinct from old.deposit_status
       or new.deposit_amount is distinct from old.deposit_amount
       or new.total is distinct from old.total
       or new.status is distinct from old.status then
      raise exception 'financial fields are read-only';
    end if;
  elsif tg_table_name = 'bookings' then
    if new.balance_amount is distinct from old.balance_amount
       or new.cancellation_charge is distinct from old.cancellation_charge
       or new.overtime_charge is distinct from old.overtime_charge
       or new.status is distinct from old.status then
      raise exception 'financial fields are read-only';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_financial on public.orders;
create trigger orders_guard_financial
before update on public.orders
for each row execute function public.guard_financial_columns();

drop trigger if exists bookings_guard_financial on public.bookings;
create trigger bookings_guard_financial
before update on public.bookings
for each row execute function public.guard_financial_columns();