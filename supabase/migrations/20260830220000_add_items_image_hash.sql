-- Lets the admin item-upload flow warn "you already have this image" before
-- an accidental duplicate upload. A plain SHA-256 of the uploaded (already
-- compressed) file bytes — exact-duplicate detection only, not perceptual
-- similarity, which is the right scope for "did I already upload this same
-- photo file". Only new/re-uploaded images get a hash going forward;
-- existing items keep image_hash null until their photo is next touched.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS image_hash text;
CREATE INDEX IF NOT EXISTS items_image_hash_idx ON public.items (image_hash) WHERE image_hash IS NOT NULL;

NOTIFY pgrst, 'reload schema';
