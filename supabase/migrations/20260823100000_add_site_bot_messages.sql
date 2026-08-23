-- The edit bot used to be one-shot: describe a change, get a PR, done. Now
-- it's a chat — the admin can send follow-up instructions ("still too big,
-- make it smaller") that revise the SAME open draft instead of starting a
-- new PR from main each time. `messages` holds that thread so the UI can
-- render it like a conversation.
ALTER TABLE public.site_bot_requests
  ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '[]'::jsonb;
