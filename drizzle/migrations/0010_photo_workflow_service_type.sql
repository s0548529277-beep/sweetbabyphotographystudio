ALTER TABLE public.photo_client_workflows
  ADD COLUMN IF NOT EXISTS has_package boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wants_editing boolean;