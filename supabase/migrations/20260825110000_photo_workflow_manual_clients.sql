-- Lets the admin start a photo-delivery workflow for ANY client (from
-- "לקוחות"), not only one who has a package='photography' booking. A
-- workflow now belongs to a client (user_id) directly; booking_id becomes
-- optional and is only set when the workflow actually originated from a
-- photography booking (so the "1. בחרו שלב" tracker can still show the
-- session date for those).

ALTER TABLE public.photo_client_workflows
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill user_id for every existing (booking-created) workflow row.
UPDATE public.photo_client_workflows w
SET user_id = b.user_id
FROM public.bookings b
WHERE w.booking_id = b.id;

ALTER TABLE public.photo_client_workflows
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN booking_id DROP NOT NULL;

-- booking_id was UNIQUE (one workflow per booking) — replace with a partial
-- unique index now that it can be null, so multiple manually-started
-- workflows (booking_id IS NULL) don't collide on that constraint.
ALTER TABLE public.photo_client_workflows DROP CONSTRAINT photo_client_workflows_booking_id_key;
CREATE UNIQUE INDEX photo_client_workflows_booking_id_uniq ON public.photo_client_workflows (booking_id) WHERE booking_id IS NOT NULL;

CREATE INDEX photo_client_workflows_user_id_idx ON public.photo_client_workflows (user_id);

-- Owner-select policies now key off workflows.user_id directly instead of
-- joining through bookings — works the same for booking-created and
-- manually-started workflows alike.
DROP POLICY "photo_client_workflows_owner_select" ON public.photo_client_workflows;
CREATE POLICY "photo_client_workflows_owner_select" ON public.photo_client_workflows FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY "photo_client_images_owner_select" ON public.photo_client_images;
CREATE POLICY "photo_client_images_owner_select" ON public.photo_client_images FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.photo_client_workflows w
    WHERE w.id = photo_client_images.workflow_id AND w.user_id = auth.uid()
  ));
