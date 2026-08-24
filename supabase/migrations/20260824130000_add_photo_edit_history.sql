-- Admin AI photo-editor: every edit attempt (original photo, chosen
-- style/settings, and the resulting edited photo once it's ready) so past
-- edits can be reviewed and re-downloaded later, not just the last one.
CREATE TABLE public.photo_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  style text NOT NULL,
  include_face boolean NOT NULL DEFAULT false,
  intensity text NOT NULL DEFAULT 'light',
  original_url text NOT NULL,
  edited_url text,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.photo_edit_history TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.photo_edit_history TO authenticated;
ALTER TABLE public.photo_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photo_edit_history_admin_all" ON public.photo_edit_history FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
