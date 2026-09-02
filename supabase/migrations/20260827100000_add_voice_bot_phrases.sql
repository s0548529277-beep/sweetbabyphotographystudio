-- Lets an admin edit the phone bot's fixed spoken phrases (greeting, menu,
-- studio/props blurbs, directions, the full equipment guide, etc.) directly
-- from /admin/voice-bot-text, without a code change or redeploy. Each row's
-- key matches a PhraseKey in src/lib/voice-phrases.server.ts; a missing key
-- (nothing ever saved, or reset back to default) falls back to that file's
-- DEFAULT_PHRASES — this table only holds overrides.
CREATE TABLE public.voice_bot_phrases (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.voice_bot_phrases TO service_role;
ALTER TABLE public.voice_bot_phrases ENABLE ROW LEVEL SECURITY;

-- Admin-only read/write from the admin editor. The phone webhook routes
-- read this via supabaseAdmin (service_role), so RLS never applies there.
CREATE POLICY "voice_bot_phrases_admin_select" ON public.voice_bot_phrases FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "voice_bot_phrases_admin_write" ON public.voice_bot_phrases FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
