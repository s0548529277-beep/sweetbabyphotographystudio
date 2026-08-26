-- Payment tracking per photo client — total_price and amount_paid are
-- always entered manually by the admin (never auto-derived from
-- PHOTO_PACKAGES), since the real agreed price often differs from the
-- price-list default. balance is a generated column so every reader
-- (list view, payments view) computes it the same way.

ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS total_price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS amount_paid numeric(10, 2) NOT NULL DEFAULT 0;

-- balance is null when total_price hasn't been entered yet ("no price set"
-- is a distinct state from "fully paid" or "nothing paid").
ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS balance numeric(10, 2) GENERATED ALWAYS AS (total_price - amount_paid) STORED;
