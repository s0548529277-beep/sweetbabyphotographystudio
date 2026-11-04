-- Owner request 2026-11-04: a client choosing proof photos in "התמונות שלי" can add a short
-- note to each picked photo before sending (what to change). Additive column only.
ALTER TABLE public.photo_client_images ADD COLUMN IF NOT EXISTS client_note text;
