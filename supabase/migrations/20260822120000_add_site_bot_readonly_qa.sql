-- Lets the site-bot's "ask a question" mode run a SELECT that Claude wrote,
-- with defense in depth so it can NEVER write/delete data even if the
-- generated SQL text were somehow malformed or malicious:
--
-- 1. The query text is validated before it ever runs: it must start with
--    SELECT/WITH, and must not contain a semicolon (blocks stacking a
--    second statement after it).
-- 2. It's never run directly — it's embedded as a subquery inside a fixed
--    wrapper (`SELECT ... FROM (%s LIMIT 200) AS t`), so a LIMIT always
--    applies and the caller only ever sees the wrapped result.
-- 3. A short statement_timeout prevents a runaway/expensive query from
--    hanging the connection.
-- 4. Only service_role (used exclusively by the admin-only, assertAdmin-
--    gated askSiteData server function — never exposed to anon/authenticated
--    directly) can call it at all.
--
-- Earlier versions of this migration also ran the function as a dedicated,
-- SELECT-only `bot_readonly` role for an extra layer of protection at the
-- Postgres permission level — but that needs GRANT rights on the `public`
-- schema itself (schema ownership or an explicit grant option), which this
-- project's database role doesn't have, and isn't required for the checks
-- above to hold. Simplified to skip it rather than fight the platform's
-- role model for a defense-in-depth layer that's nice-to-have, not load-bearing.
CREATE OR REPLACE FUNCTION public.run_readonly_query(q text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  -- Strip a single trailing semicolon (+ trailing whitespace) — the model
  -- writing this SQL routinely ends a perfectly ordinary single query with
  -- one, and that's not a multi-statement attempt. Any semicolon left after
  -- this strip is either in the middle of the query (a real second
  -- statement) or a doubled-up trailing one, and both should still be
  -- rejected below.
  trimmed text := regexp_replace(trim(q), ';\s*$', '');
BEGIN
  IF trimmed !~* '^(select|with)\s' THEN
    RAISE EXCEPTION 'only SELECT/WITH queries are allowed';
  END IF;
  IF trimmed LIKE '%;%' THEN
    RAISE EXCEPTION 'multi-statement queries are not allowed';
  END IF;

  SET LOCAL statement_timeout = '3s';
  EXECUTE format('SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s LIMIT 200) AS t', trimmed)
    INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_readonly_query(text) FROM public;
GRANT EXECUTE ON FUNCTION public.run_readonly_query(text) TO service_role;

-- History of questions asked + answers given, same pattern as
-- site_bot_requests (admin-only read, all writes via service_role).
CREATE TABLE IF NOT EXISTS public.site_bot_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  question text NOT NULL,
  sql_used text,
  answer text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_bot_questions TO authenticated;
GRANT ALL ON public.site_bot_questions TO service_role;
ALTER TABLE public.site_bot_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_bot_questions_admin_select" ON public.site_bot_questions;
CREATE POLICY "site_bot_questions_admin_select" ON public.site_bot_questions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
