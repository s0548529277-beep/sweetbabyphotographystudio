-- Payment tracking + gallery-opened marker for the newborn-package
-- dashboard/payments views (/admin/newborn-packages) — built to mirror the
-- reference tool (ChikTime) the studio owner showed: open balance / paid
-- this month / galleries count / upcoming shoots.
ALTER TABLE public.newborn_package_orders
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS gallery_opened_at timestamptz;

NOTIFY pgrst, 'reload schema';
