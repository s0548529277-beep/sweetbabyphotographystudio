-- Customer edits of a studio booking / props order (owner request 2026-11-14).
-- An edit made less than 24h before the session needs the admin's approval: it is stored here as a
-- 'pending' request and applied only when the admin approves. Edits applied at once are logged with auto_applied = true.
-- Additive; RLS on with no policies (only the server, via the service role, reads/writes it).
CREATE TABLE IF NOT EXISTS public.order_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('booking', 'order')),
  target_id uuid NOT NULL,
  user_id uuid NOT NULL,
  changes jsonb NOT NULL,
  original jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  auto_applied boolean NOT NULL DEFAULT false,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS order_edit_requests_status_idx ON public.order_edit_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_edit_requests_target_idx ON public.order_edit_requests (kind, target_id);
ALTER TABLE public.order_edit_requests ENABLE ROW LEVEL SECURITY;
