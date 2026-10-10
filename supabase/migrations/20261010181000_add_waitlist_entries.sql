-- Waitlist for a fully-booked studio date: a visitor who wants an already-
-- taken date can leave contact details here instead of just bouncing off
-- the booking page. When a booking on that date is cancelled, every
-- un-notified entry for that date gets an email nudge that the day may
-- have opened up (see notifyWaitlistForFreedSlot, waitlist.functions.ts).
-- Inserts go through the joinWaitlist server function using the
-- service-role client (same write pattern as newsletter_signups), so there
-- is no anon insert policy here, only an admin-only read.
CREATE TABLE public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  notes text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX waitlist_entries_pending_by_date_idx
  ON public.waitlist_entries (session_date)
  WHERE notified_at IS NULL;

GRANT SELECT, UPDATE ON public.waitlist_entries TO authenticated;
GRANT ALL ON public.waitlist_entries TO service_role;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_entries_admin_select" ON public.waitlist_entries FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "waitlist_entries_admin_update" ON public.waitlist_entries FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
