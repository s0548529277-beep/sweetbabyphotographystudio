-- Applied 2026-10-25 by Claude (chat session, at the owner's request).
-- These seven supabase/migrations files were written outside Lovable
-- (Oct 15–21) and never reached the live database, so the code that
-- depends on them silently degraded (personal/business tag dropped,
-- recurring expenses + "mark balance paid" + outdoor packages + newborn
-- package types + album details + step trackers all failing).
-- Bundled here verbatim, in date order, so Lovable's drizzle journal
-- knows they ran. Only addition vs. the originals: explicit
-- "GRANT ... TO authenticated" on the four new tables (RLS still limits
-- them to admins), matching cm_* tables. All additive — nothing dropped.

-- ===== from supabase/migrations/20261015000000_client_production_step_trackers.sql =====
-- Two independent visual progress trackers, shown as a breadcrumb at the
-- top of the gallery — "pink" is the CLIENT's own journey (what she sees
-- on her own gallery page), "gold" is the photographer's internal
-- production pipeline (admin-only). Deliberately separate from the
-- existing `stage` column, which keeps driving actual logic (proof-
-- selection locking etc.) — these two are purely a manually-advanced
-- visual indicator. Same two columns added to both the main
-- photo_client_workflows flow and the separate newborn_package_orders
-- flow, per this session's established pattern.
alter table public.photo_client_workflows
  add column if not exists client_step int not null default 1 check (client_step between 1 and 4),
  add column if not exists production_step int not null default 1 check (production_step between 1 and 6);

alter table public.newborn_package_orders
  add column if not exists client_step int not null default 1 check (client_step between 1 and 4),
  add column if not exists production_step int not null default 1 check (production_step between 1 and 6);

-- ===== from supabase/migrations/20261016000000_newborn_package_types.sql =====
-- Admin-editable newborn package list — a "version 2" alternative to the
-- hardcoded NEWBORN_PACKAGES array in src/lib/newborn-packages.ts, modeled
-- directly on the photographer-portal project's `package_types` table/UI
-- (same field names: name/price/description/sort_order/active) per
-- explicit request to copy that system as-is so it can be compared
-- side-by-side with the existing hardcoded list. Purely additive — doesn't
-- touch NEWBORN_PACKAGES, newborn_package_orders, or anything that reads
-- from them; nothing here is wired into order creation yet.
CREATE TABLE public.newborn_package_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.newborn_package_types TO service_role;
ALTER TABLE public.newborn_package_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newborn_package_types_admin_all" ON public.newborn_package_types FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));


-- ===== from supabase/migrations/20261017000000_newborn_album_details.sql =====
-- "פרטים לעיצוב האלבום" — a short form the newborn client fills in on her
-- own gallery page, right after she finishes picking her favorite proof
-- photos (maps onto CLIENT_STEPS step 3, "בחירת כיתובים, תמונות לקולאז'
-- וכריכה" — see gallery-steps.ts). Gives Michal the details she actually
-- needs while designing the album, without a phone call back and forth.
alter table public.newborn_package_orders
  add column if not exists album_child_name text,
  add column if not exists album_birth_weight text,
  add column if not exists album_birth_time text,
  add column if not exists album_birth_date date,
  add column if not exists album_hospital text,
  -- 'hebrew' | 'latin' — caption lettering preference for the album design.
  add column if not exists album_caption_language text check (album_caption_language is null or album_caption_language in ('hebrew', 'latin')),
  add column if not exists album_notes text,
  add column if not exists album_details_submitted_at timestamptz;

-- ===== from supabase/migrations/20261018000000_expenses_is_personal.sql =====
-- "הוצאות אישיות לבית" — per explicit request, expenses marked "אישי" are
-- now actually saved (not discarded) so they can be tracked and filtered
-- separately from business expenses in the Excel export. Defaults to
-- false so every pre-existing row (all business, since personal rows were
-- previously thrown away on import) keeps reading as business.
alter table public.expenses
  add column if not exists is_personal boolean not null default false;

-- ===== from supabase/migrations/20261019000000_manual_income_is_personal.sql =====
-- Same personal/business tag as expenses.is_personal (see
-- 20261018000000_expenses_is_personal.sql), now on manual_income too — a
-- monthly bank/credit-card import can contain both deposits and charges,
-- and both need to be classifiable as personal or business, not just
-- expenses. Defaults to false so every pre-existing row keeps reading as
-- business.
alter table public.manual_income
  add column if not exists is_personal boolean not null default false;

-- ===== from supabase/migrations/20261020000000_booking_balance_paid.sql =====
-- Tracks whether a studio booking's remaining balance (bookings.balance_amount
-- — the gap between the deposit paid at booking time and the full price,
-- normally collected in person at the session) was actually collected.
-- Nothing in this app ever updated balance_amount back to 0 once that
-- happened, so there was no way to tell a real open balance apart from one
-- already paid in person — this column is admin-marked (see
-- /admin/finance's "חובות לקוחות" section) once she's collected it.
-- Defaults to false so every pre-existing booking with a balance reads as
-- outstanding until she goes through and marks the already-collected ones.
alter table public.bookings
  add column if not exists balance_paid boolean not null default false;

-- ===== from supabase/migrations/20261020000000_outdoor_package_orders.sql =====
-- Lightweight internal CRM for "צילומי חוץ" (outdoor/location photography)
-- leads/deals — mirrors newborn_package_orders' own spirit (an
-- admin-only pipeline, never customer-facing, see that table's own
-- migration comment) but scoped to exactly what was asked for this track:
-- contact details, a styling-call date (with an automatic reminder to the
-- studio owner), the session day/time, whether the deposit came in, and a
-- one-click contract send — not the full newborn production pipeline
-- (gallery, proof selection, Drive sync etc.), which this track has no use
-- for.

-- Admin-editable outdoor package list — same shape as newborn_package_types
-- (20261016000000_newborn_package_types.sql): name/price/description/
-- sort_order/active.
CREATE TABLE public.outdoor_package_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.outdoor_package_types TO service_role;
ALTER TABLE public.outdoor_package_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outdoor_package_types_admin_all" ON public.outdoor_package_types FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.outdoor_package_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type_id uuid REFERENCES public.outdoor_package_types(id) ON DELETE SET NULL,
  -- Snapshot so a later edit/delete of the package type doesn't rewrite
  -- history — same pattern as newborn_package_orders.plan_name etc.
  package_name text,
  package_description text,
  total_price numeric,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text,
  children_count integer,
  children_names text,
  styling_call_date date,
  styling_call_reminder_sent_at timestamptz,
  session_date date,
  session_time text, -- "HH:MM", free text like bookings.start_time
  deposit_paid boolean NOT NULL DEFAULT false,
  contract_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.outdoor_package_orders TO service_role;
ALTER TABLE public.outdoor_package_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outdoor_package_orders_admin_all" ON public.outdoor_package_orders FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));


-- ===== from supabase/migrations/20261021000000_recurring_expenses.sql =====
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


-- ===== added: browser-client access for the new admin tables =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newborn_package_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outdoor_package_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outdoor_package_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;

NOTIFY pgrst, 'reload schema';
