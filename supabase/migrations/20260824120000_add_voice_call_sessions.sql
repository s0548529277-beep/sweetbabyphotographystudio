-- Stores the growing conversation for one phone call to the voice AI
-- assistant, keyed by Twilio's CallSid — each turn of the call is a
-- separate, stateless webhook request from Twilio (POST /api/voice/incoming,
-- then repeated POSTs to /api/voice/respond), so this table is what lets the
-- assistant remember what was already said earlier in the same call.
CREATE TABLE public.voice_call_sessions (
  call_sid text PRIMARY KEY,
  from_number text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.voice_call_sessions TO service_role;
ALTER TABLE public.voice_call_sessions ENABLE ROW LEVEL SECURITY;

-- Admin-only read (e.g. to review call transcripts later). All writes go
-- through the Twilio webhook routes using service_role — same pattern as
-- customer_chat_logs.
CREATE POLICY "voice_call_sessions_admin_select" ON public.voice_call_sessions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
