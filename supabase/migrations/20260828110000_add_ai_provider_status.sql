-- Singleton row tracking which AI provider/model actually served the most
-- recent successful request (Gemini direct / Groq / Lovable gateway) — so
-- it's possible to tell, after the fact, which one is really being used
-- without server-log access. Updated on every successful call;
-- admin_notifications gets a one-off entry only when the provider actually
-- *changes* (a real failover or recovery), not on every routine call.
CREATE TABLE IF NOT EXISTS public.ai_provider_status (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text,
  model text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_status ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ai_provider_status TO service_role;

NOTIFY pgrst, 'reload schema';
