-- "תזכירי לי מחר": a lead the owner parked for a reminder (status follow_up + remind_at).
-- The hourly digest lists such a lead only once remind_at has passed. Additive, idempotent.
ALTER TABLE public.inquiry_leads ADD COLUMN IF NOT EXISTS remind_at timestamptz;
