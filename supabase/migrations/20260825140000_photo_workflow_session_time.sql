-- Shoot time-of-day, alongside the existing session_date — needed for the
-- calendar view ("לוח שנה") to show per-slot times like "09:00 — מיכל כהן"
-- instead of just a date. Manual entry, editable independently; for a
-- booking-linked workflow with no session_time of its own, the app falls
-- back to the linked booking's start_time — same pattern already used for
-- session_date.
ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS session_time time;
