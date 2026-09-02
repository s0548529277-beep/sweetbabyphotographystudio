-- Generic key/value store for small admin-configurable settings that don't
-- warrant their own table. First use: the phone voice bot's TTS voice
-- (see voice_bot_voice below and src/lib/voice-settings.server.ts).
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only, both read and write — direct client CRUD guarded by RLS, same
-- pattern as retouch_presets.
CREATE POLICY "app_settings_admin_all" ON public.app_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Seed with the value already hardcoded into twilio.server.ts before this
-- migration (a Hebrew female Google WaveNet voice) so the DB matches what
-- was actually live, and the admin picker opens already showing "reality".
INSERT INTO public.app_settings (key, value) VALUES ('voice_bot_voice', 'female')
  ON CONFLICT (key) DO NOTHING;
