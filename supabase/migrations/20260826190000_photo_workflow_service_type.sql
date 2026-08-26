-- Not every photo client bought the same thing: some booked a full package
-- (photography + editing + album, tracked through the existing 5-stage
-- pipeline), others only rented the studio and may or may not have also
-- bought photo editing separately. has_package distinguishes those two;
-- wants_editing only matters when has_package is false — a studio-only
-- client who didn't buy editing gets a plain "upload the photos, done" card
-- instead of the whole proofs->selection->album pipeline, since there's
-- nothing for her to choose between.
--
-- Existing rows default to has_package = true (every workflow created
-- before this migration WAS a package client — this is additive, not a
-- reclassification of anyone's existing data).

ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS has_package boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wants_editing boolean;
