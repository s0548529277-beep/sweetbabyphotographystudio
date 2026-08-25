-- Client photo-delivery workflow — tracks a photography client (a
-- bookings row with package='photography') through five stages:
--   booked            -> deposit paid (mirrors the booking's own deposit_status)
--   date_confirmed    -> admin manually confirmed the final shoot day
--   proofs_ready      -> admin uploaded proof photos, customer can pick favorites
--   edited_uploaded   -> admin uploaded edited versions of the picks (draft, not visible to the customer yet)
--   album_published   -> admin published the final album — customer now sees it
CREATE TABLE public.photo_client_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'booked',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE TABLE public.photo_client_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.photo_client_workflows(id) ON DELETE CASCADE,
  kind text NOT NULL, -- 'proof' | 'edited'
  storage_path text NOT NULL,
  image_url text NOT NULL,
  selected boolean NOT NULL DEFAULT false, -- the customer's pick, meaningful only for kind='proof'
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX photo_client_images_workflow_idx ON public.photo_client_images (workflow_id);

GRANT ALL ON public.photo_client_workflows TO service_role;
GRANT ALL ON public.photo_client_images TO service_role;
GRANT SELECT ON public.photo_client_workflows TO authenticated;
GRANT SELECT ON public.photo_client_images TO authenticated;
ALTER TABLE public.photo_client_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_client_images ENABLE ROW LEVEL SECURITY;

-- Admin: full access to everything.
CREATE POLICY "photo_client_workflows_admin_all" ON public.photo_client_workflows FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "photo_client_images_admin_all" ON public.photo_client_images FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Customer: read-only access to her own workflow/images (matched through
-- the underlying booking's user_id). Writes (toggling a proof pick) go
-- through a dedicated server function using service_role instead of a raw
-- client update, so it can validate the workflow is actually still in the
-- "proofs_ready" stage and only ever touch the `selected` column.
CREATE POLICY "photo_client_workflows_owner_select" ON public.photo_client_workflows FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = photo_client_workflows.booking_id AND b.user_id = auth.uid()));
CREATE POLICY "photo_client_images_owner_select" ON public.photo_client_images FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.photo_client_workflows w
    JOIN public.bookings b ON b.id = w.booking_id
    WHERE w.id = photo_client_images.workflow_id AND b.user_id = auth.uid()
  ));
