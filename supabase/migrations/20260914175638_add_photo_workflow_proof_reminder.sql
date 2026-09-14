-- Dedup marker for the "please select your photos" reminder — sent once,
-- 7 days after the shoot, if the client hasn't finished picking her proofs
-- yet. Same idiom as bookings.reminder_sent_at.
ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS proof_reminder_sent_at timestamptz;
