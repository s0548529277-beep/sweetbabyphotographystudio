
-- 1) Restrict anon access to bookings: replace public policy with a limited view

DROP POLICY IF EXISTS "anon reads busy slots" ON public.bookings;

CREATE OR REPLACE VIEW public.booking_busy_slots
WITH (security_invoker = on) AS
SELECT session_date, start_time, end_time
FROM public.bookings
WHERE status <> 'cancelled';

-- Allow anon/auth to see busy slot times only, via a permissive policy
-- restricted through the view (base table still blocked for anon since we dropped the anon policy).
-- The view uses security_invoker, so we need a SELECT policy that permits reading the limited columns.
-- We reintroduce a narrow SELECT policy that allows reading rows but the view only exposes 3 columns.
-- Because Postgres RLS is row-level (not column-level), any anon SELECT could still get all columns
-- if they hit the table directly. Solution: keep the anon policy off the base table, and instead
-- grant SELECT on the view to anon while the view runs as the invoker.
-- To make security_invoker view work for anon, we need a SELECT policy for anon on the base table.
-- Workaround: switch view to SECURITY DEFINER semantics by setting security_invoker=off (default),
-- so it runs as the view owner (postgres) and bypasses RLS.

DROP VIEW IF EXISTS public.booking_busy_slots;

CREATE VIEW public.booking_busy_slots AS
SELECT session_date, start_time, end_time
FROM public.bookings
WHERE status <> 'cancelled';

GRANT SELECT ON public.booking_busy_slots TO anon, authenticated;

-- 2) Prevent privilege escalation on user_roles.
-- Currently there is no INSERT policy for regular users, but there is also no restrictive policy.
-- The existing "Admins manage roles" ALL policy allows admin inserts.
-- The handle_new_user() trigger is SECURITY DEFINER so it bypasses RLS.
-- Add a restrictive policy to guarantee no non-admin can insert.

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
