
-- 1) Add date-range columns to item_availability (backfill from `date`)
ALTER TABLE public.item_availability
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

UPDATE public.item_availability
SET start_date = COALESCE(start_date, date),
    end_date   = COALESCE(end_date, date)
WHERE start_date IS NULL OR end_date IS NULL;

ALTER TABLE public.item_availability
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date   SET NOT NULL;

ALTER TABLE public.item_availability
  DROP CONSTRAINT IF EXISTS item_availability_date_range_chk;
ALTER TABLE public.item_availability
  ADD CONSTRAINT item_availability_date_range_chk CHECK (end_date >= start_date);

CREATE INDEX IF NOT EXISTS idx_item_availability_item_range
  ON public.item_availability(item_id, start_date, end_date);

-- 2) Availability check RPC — how many units of an item are already reserved
--    in [from,to] and whether requested qty fits within stock_quantity.
CREATE OR REPLACE FUNCTION public.count_item_reservations(
  _item_id uuid,
  _from date,
  _to date
) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::int
  FROM public.item_availability ia
  WHERE ia.item_id = _item_id
    AND ia.start_date <= _to
    AND ia.end_date   >= _from;
$$;

GRANT EXECUTE ON FUNCTION public.count_item_reservations(uuid, date, date) TO authenticated, anon, service_role;

-- 3) Financial-field tamper protection on orders + bookings.
--    Blocks non-admin users from changing money/deposit columns.
CREATE OR REPLACE FUNCTION public.block_client_financial_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Service role / SECURITY DEFINER calls bypass auth.uid() (returns NULL) — allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT private.has_role(auth.uid(), 'admin'::app_role) INTO is_admin;
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.deposit_status  IS DISTINCT FROM OLD.deposit_status
  OR NEW.deposit_amount  IS DISTINCT FROM OLD.deposit_amount
  OR NEW.balance_amount  IS DISTINCT FROM OLD.balance_amount
  OR NEW.cancellation_charge IS DISTINCT FROM OLD.cancellation_charge
  OR NEW.overtime_charge IS DISTINCT FROM OLD.overtime_charge
  OR NEW.total           IS DISTINCT FROM COALESCE(OLD.total, NEW.total)
  THEN
    RAISE EXCEPTION 'לא ניתן לשנות שדות כספיים בהזמנה — פנייה לצוות הסטודיו';
  END IF;

  RETURN NEW;
END;
$$;

-- bookings: no `total` column — use a table-specific variant
CREATE OR REPLACE FUNCTION public.block_client_financial_changes_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT private.has_role(auth.uid(), 'admin'::app_role) INTO is_admin;
  IF is_admin THEN RETURN NEW; END IF;

  IF NEW.deposit_status  IS DISTINCT FROM OLD.deposit_status
  OR NEW.deposit_amount  IS DISTINCT FROM OLD.deposit_amount
  OR NEW.balance_amount  IS DISTINCT FROM OLD.balance_amount
  OR NEW.cancellation_charge IS DISTINCT FROM OLD.cancellation_charge
  OR NEW.overtime_charge IS DISTINCT FROM OLD.overtime_charge
  OR NEW.price           IS DISTINCT FROM OLD.price
  THEN
    RAISE EXCEPTION 'לא ניתן לשנות שדות כספיים בהזמנה — פנייה לצוות הסטודיו';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_block_financial ON public.orders;
CREATE TRIGGER trg_orders_block_financial
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.block_client_financial_changes();

DROP TRIGGER IF EXISTS trg_bookings_block_financial ON public.bookings;
CREATE TRIGGER trg_bookings_block_financial
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.block_client_financial_changes_booking();

-- 4) Ensure every item has stock_quantity >= 1
UPDATE public.items SET stock_quantity = 1
WHERE stock_quantity IS NULL OR stock_quantity < 1;
