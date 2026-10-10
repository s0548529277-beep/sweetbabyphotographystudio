-- Per-phone-number WhatsApp auto-reply state. `messages` holds a short
-- rolling conversation history (same {role,content} shape chatWithBot uses)
-- so the bot has context across a back-and-forth, capped at the last 20
-- turns in code (whatsapp-bot.server.ts) so this never grows unbounded.
-- `handoff_requested_at` is set the moment a customer asks for a real
-- person (see wantsHumanHandoff) — while it's set, the bot stays silent on
-- this number (Michal is handling it personally) until an admin clears it
-- from /admin/whatsapp.
CREATE TABLE public.whatsapp_bot_sessions (
  phone text PRIMARY KEY,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  handoff_requested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.whatsapp_bot_sessions TO authenticated;
GRANT ALL ON public.whatsapp_bot_sessions TO service_role;
ALTER TABLE public.whatsapp_bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_bot_sessions_admin_select" ON public.whatsapp_bot_sessions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "whatsapp_bot_sessions_admin_update" ON public.whatsapp_bot_sessions FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
