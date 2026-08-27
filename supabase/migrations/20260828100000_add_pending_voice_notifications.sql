-- A lightweight "message waiting" mailbox keyed by phone number. The studio
-- notifies a customer with a free missed-call-style outbound ring (Yemot's
-- RunCampaign call rings and disconnects without actually speaking — no
-- units spent) instead of paying for a full spoken call, and the real
-- message (booking confirmation / reminder, door code included) is
-- delivered the moment she calls the studio's line back — played once on
-- that first callback, then cleared, so every call after that is normal.
CREATE TABLE IF NOT EXISTS public.pending_voice_notifications (
  phone text PRIMARY KEY,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_voice_notifications ENABLE ROW LEVEL SECURITY;
-- Accessed only through supabaseAdmin (service role) from server code —
-- no client-facing policies needed.
GRANT ALL ON public.pending_voice_notifications TO service_role;

NOTIFY pgrst, 'reload schema';
