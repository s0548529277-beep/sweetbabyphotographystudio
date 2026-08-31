-- Free-text notes an admin types in /admin/bot-knowledge, appended to every
-- AI bot's (site chat + voice) system prompt so new facts (like "a newborn
-- session via birth-basket benefit is free") take effect immediately,
-- without a code change/redeploy. Same shape/RLS pattern as
-- voice_bot_phrases — admin-only read/write, service_role bypasses RLS for
-- the bots' own server-side reads.
CREATE TABLE public.bot_knowledge_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_knowledge_notes TO service_role;
ALTER TABLE public.bot_knowledge_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_knowledge_notes_admin_select" ON public.bot_knowledge_notes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "bot_knowledge_notes_admin_write" ON public.bot_knowledge_notes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
