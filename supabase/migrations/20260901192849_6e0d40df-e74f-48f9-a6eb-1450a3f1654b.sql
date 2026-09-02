drop trigger if exists orders_guard_financial on public.orders;
drop trigger if exists bookings_guard_financial on public.bookings;
drop function if exists public.guard_financial_columns();