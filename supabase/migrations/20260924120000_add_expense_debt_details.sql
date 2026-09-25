-- Lets an expense be recorded as an unpaid debt owed to a supplier, with
-- contact details to follow up on — not just a simple already-paid line
-- item like the existing title/amount/category/spent_on columns support.
ALTER TABLE public.expenses
  ADD COLUMN vendor_name text,
  ADD COLUMN vendor_email text,
  ADD COLUMN vendor_phone text,
  ADD COLUMN due_date date,
  ADD COLUMN is_paid boolean NOT NULL DEFAULT true;
