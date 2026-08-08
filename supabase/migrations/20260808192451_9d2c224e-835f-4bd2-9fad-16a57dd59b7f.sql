ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS items_sort_order_idx ON public.items (sort_order);