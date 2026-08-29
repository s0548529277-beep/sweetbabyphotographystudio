-- Holds the in-progress structured fields (name/date/hour/slots/email) for
-- the no-AI, fixed-question phone booking flow (voice-noai-booking.server.ts)
-- while it's collected turn by turn — same reason `stage` was added: each
-- Yemot/Twilio webhook hit is its own stateless request, so anything that
-- needs to survive to the next turn has to live here rather than in a
-- function-local variable. Kept separate from `messages` (the AI
-- conversation transcript) since this flow never talks to the AI at all.
ALTER TABLE public.voice_call_sessions
  ADD COLUMN IF NOT EXISTS draft_booking jsonb;

NOTIFY pgrst, 'reload schema';
