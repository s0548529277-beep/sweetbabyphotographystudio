-- Lets the site-bot's "ask a question" mode run a SELECT that Claude wrote,
-- with defense in depth so it can NEVER write/delete data even if the
-- generated SQL text were somehow malformed or malicious:
--
-- 1. run_readonly_query is SECURITY DEFINER but OWNED BY a dedicated role
--    (bot_readonly) that has ONLY SELECT granted on the public schema — no
--    INSERT/UPDATE/DELETE/DDL rights exist for that role at the Postgres
--    permission level, regardless of what the query text says. This is the
--    real protection — not just text filtering.
-- 2. A short statement_timeout prevents a runaway/expensive query from
--    hanging the connection.
-- 3. The query is wrapped so a LIMIT 200 always applies, and the result is
--    returned as jsonb so the caller never touches raw SQL results.
DO $$
BEGIN
  CREATE ROLE bot_readonly NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT USAGE ON SCHEMA public TO bot_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bot_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bot_readonly;

CREATE OR REPLACE FUNCTION public.run_readonly_query(q text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  trimmed text := trim(q);
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

-- Postgres 16+ requires the current role to be able to SET ROLE to the
-- target before it can hand ownership over (ALTER ... OWNER TO otherwise
-- fails with "must be able to SET ROLE"). The role that ran CREATE ROLE
-- above has CREATEROLE, which is enough to grant itself membership here.
GRANT bot_readonly TO current_user;
ALTER FUNCTION public.run_readonly_query(text) OWNER TO bot_readonly;
REVOKE ALL ON FUNCTION public.run_readonly_query(text) FROM public;
GRANT EXECUTE ON FUNCTION public.run_readonly_query(text) TO service_role;

-- History of questions asked + answers given, same pattern as
-- site_bot_requests (admin-only read, all writes via service_role).
CREATE TABLE public.site_bot_questions (
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

CREATE POLICY "site_bot_questions_admin_select" ON public.site_bot_questions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
