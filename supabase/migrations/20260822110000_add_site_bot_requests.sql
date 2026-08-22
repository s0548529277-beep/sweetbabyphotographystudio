-- Tracks every change the admin site-editing bot proposes. Each row is one
-- request: an instruction + which file it targets, the GitHub branch/PR the
-- bot opened, and its current status. Nothing here ever touches `main`
-- directly — the bot always opens a PR; publishing is a separate explicit
-- admin action (merge) tracked here too.
CREATE TABLE public.site_bot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  instruction text NOT NULL,
  target_path text NOT NULL,
  status text NOT NULL DEFAULT 'proposing' CHECK (status IN ('proposing', 'proposed', 'failed', 'merged', 'rejected')),
  branch_name text,
  pr_number integer,
  pr_url text,
  summary text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  merged_at timestamptz
);

GRANT SELECT ON public.site_bot_requests TO authenticated;
GRANT ALL ON public.site_bot_requests TO service_role;
ALTER TABLE public.site_bot_requests ENABLE ROW LEVEL SECURITY;

-- Admin-only read. All writes go through server functions using
-- service_role (assertAdmin-gated), never through the client directly —
-- same pattern as customer_loyalty.
CREATE POLICY "site_bot_requests_admin_select" ON public.site_bot_requests FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
