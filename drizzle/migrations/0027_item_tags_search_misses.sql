-- Props catalog search upgrade (owner approved 2026-11-02):
--  1) items.tags — per-item tags edited in /admin/items, searched by the
--     catalog, the style chips and the chat bot (e.g. "חלאקה", "סמאש קייק").
--  2) catalog_search_misses — typed catalog searches that returned nothing,
--     counted per query, shown to the admin so missing words/tags are visible.
--     Anonymous visitors can only call log_catalog_search_miss(); the table
--     itself is admin-only (read/delete) and capped at 2000 distinct queries.

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.catalog_search_misses (
  query_norm text PRIMARY KEY,
  query_sample text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.catalog_search_misses TO authenticated;
GRANT ALL ON public.catalog_search_misses TO service_role;
ALTER TABLE public.catalog_search_misses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catalog_search_misses_admin_read" ON public.catalog_search_misses;
CREATE POLICY "catalog_search_misses_admin_read" ON public.catalog_search_misses
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "catalog_search_misses_admin_delete" ON public.catalog_search_misses;
CREATE POLICY "catalog_search_misses_admin_delete" ON public.catalog_search_misses
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_catalog_search_miss(_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := left(btrim(coalesce(_query, '')), 80);
  n text;
BEGIN
  IF length(q) < 2 THEN RETURN; END IF;
  n := lower(regexp_replace(q, '\s+', ' ', 'g'));
  IF NOT EXISTS (SELECT 1 FROM public.catalog_search_misses WHERE query_norm = n)
     AND (SELECT count(*) FROM public.catalog_search_misses) >= 2000 THEN
    RETURN; -- keep the table small even if someone floods it with random text
  END IF;
  INSERT INTO public.catalog_search_misses (query_norm, query_sample)
  VALUES (n, q)
  ON CONFLICT (query_norm) DO UPDATE
    SET hits = public.catalog_search_misses.hits + 1, last_seen = now();
END;
$$;
REVOKE ALL ON FUNCTION public.log_catalog_search_miss(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_catalog_search_miss(text) TO anon, authenticated;
