-- Admin-defined monthly recurring expenses (e.g. rent, ₪1200/month) — so she
-- doesn't have to re-type the same expense by hand every month. A periodic
-- job (runDueRecurringExpenses, called from api.send-booking-reminders.ts
-- alongside the other scheduled jobs) inserts a real row into `expenses`
-- once per month, once day_of_month has passed, and records the month it
-- last generated for (last_generated_month) so it never double-inserts.
-- day_of_month is capped at 28 to sidestep short-month edge cases (Feb).
CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL DEFAULT 'אחר',
  day_of_month smallint NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  is_personal boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  last_generated_month text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.recurring_expenses TO service_role;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_expenses_admin_all" ON public.recurring_expenses FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
