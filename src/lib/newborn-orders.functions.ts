// Admin-only CRUD for the newborn-package order tracker (see
// newborn-packages.ts for the package/addon/timeline-step definitions and
// /admin/newborn-packages for the UI). Never customer-facing.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { NEWBORN_ADDONS, NEWBORN_TIMELINE_STEP_KEYS, findNewbornPackage } from "@/lib/newborn-packages";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

// Keeps the order's Google Calendar event in sync with its current
// date/time/name — mirrors the exact create pattern used for public studio
// bookings (bookings.functions.ts's finalizeBookingConfirmation), just
// without waiting for a separate "deposit confirmed" step: an admin
// creating/editing this order IS the confirmation here, there's no
// customer-facing pending stage. Always best-effort — a Calendar hiccup
// must never block saving the order itself, so every failure is caught and
// logged, never thrown. Deletes the previous event (if any) before
// creating a new one rather than trying to update in place, since
// calendar.server.ts only exposes create/delete, not update — cheap and
// correct for the low write-frequency this page actually sees.
// No time set yet still gets a 10:00 default rather than skipping the sync
// entirely, so the date is at least blocked/visible on the calendar; a real
// time can be added later via edit, which re-syncs.
const DEFAULT_SESSION_TIME = "10:00";
const NEWBORN_SESSION_HOURS = 2; // typical newborn session length — a real, exact per-order duration isn't tracked anywhere yet.

/** `[startTime, endTime]` (both "HH:MM"), given a possibly-missing session_time — shared by the calendar sync and the availability-blocking sync below so the two always agree on the exact same window. */
function newbornSessionWindow(sessionTime: string | null): [string, string] {
  const start = sessionTime || DEFAULT_SESSION_TIME;
  const [h, m] = start.split(":").map(Number);
  const endMin = h * 60 + m + NEWBORN_SESSION_HOURS * 60;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  return [start, end];
}

/**
 * Returns null on success (or "nothing to do" — no date set), or the real
 * error message on failure. Previously this swallowed every failure with
 * only a console.error — invisible to the admin, who just saw "created,
 * not on the calendar" with zero way to know why (a real report). Still
 * NEVER throws — a Calendar hiccup must never block saving the order
 * itself — but now the caller can surface the actual reason instead of a
 * silent gap.
 */
async function syncNewbornCalendarEvent(
  db: any,
  order: { id: string; contact_name: string; contact_email: string | null; session_date: string | null; session_time: string | null; google_event_id?: string | null },
): Promise<string | null> {
  try {
    const { createGoogleCalendarEvent, deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
    if (order.google_event_id) {
      await deleteGoogleCalendarEvent(order.google_event_id).catch(() => {});
    }
    if (!order.session_date) {
      if (order.google_event_id) await db.from("newborn_package_orders").update({ google_event_id: null }).eq("id", order.id);
      return null;
    }
    const [time, endTime] = newbornSessionWindow(order.session_time);
    const event = await createGoogleCalendarEvent({
      summary: `ניו-בורן · ${order.contact_name}`,
      description: order.contact_email ? `מייל: ${order.contact_email}` : undefined,
      startISO: `${order.session_date}T${time}:00`,
      endISO: `${order.session_date}T${endTime}:00`,
      location: "תלמוד ירושלמי 24, בית שמש",
      attendees: order.contact_email ? [order.contact_email] : [],
    });
    if (!event) return "יצירת האירוע ביומן החזירה תוצאה ריקה";
    await db.from("newborn_package_orders").update({ google_event_id: event.id }).eq("id", order.id);
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[SWEETBABY] newborn order calendar sync failed", e);
    return message;
  }
}

/**
 * THE part that actually stops a customer from renting the studio during a
 * scheduled newborn session — per explicit request ("אני רוצה שזה יסגור
 * את השעות... שאנשים לא יוכלו להשכיר את הסטודיו"). Google Calendar sync
 * above is a nice-to-have visual mirror, but studioAvailability
 * (availability.server.ts) — the function every real availability check in
 * this app calls — reads busy time from the `bookings` table directly and
 * ONLY secondarily merges in Google Calendar; it doesn't depend on that
 * connector being linked at all. So this creates a REAL row in `bookings`
 * for the order's session window, exactly like any other studio booking.
 *
 * `deposit_status` is deliberately NOT "pending": bookingBlocksSlot()
 * treats a "pending" deposit as a temporary hold that EXPIRES after
 * PENDING_HOLD_MINUTES (60) unless renewed — wrong for a newborn session an
 * admin already committed to. "not_required" (any value other than the
 * literal "pending" works) blocks permanently, matching a confirmed studio
 * booking after its deposit is paid.
 *
 * `user_id` has to be a real auth.users row (bookings.user_id is NOT
 * NULL + a foreign key) — a newborn-package customer usually has no site
 * account at all, so this uses the ADMIN'S OWN id (the one creating/editing
 * the order) rather than inventing a customer account just to satisfy the
 * constraint. It reads as "the studio owner blocked this slot herself",
 * which is exactly what's happening.
 *
 * Same delete-then-recreate approach as the calendar sync (no in-place
 * "move" primitive needed for this low write-frequency), and the same
 * "never throw, return the real error message" contract.
 */
type BookingBlockResult = { error: string | null; confirmed?: { date: string; start: string; end: string } };

async function syncNewbornBookingBlock(
  db: any,
  adminUserId: string,
  order: {
    id: string;
    contact_name: string;
    contact_phone: string;
    session_date: string | null;
    session_time: string | null;
    total_price?: number | null;
    blocking_booking_id?: string | null;
  },
): Promise<BookingBlockResult> {
  try {
    if (order.blocking_booking_id) {
      // Supabase's query builder is PromiseLike (only `.then`, no
      // `.catch`/`.finally`) — plain `await` is correct here; a query
      // error resolves as `{ error }`, it doesn't reject the promise, so
      // there's nothing further to handle even on failure (best-effort
      // cleanup of the old row before creating its replacement below).
      await db.from("bookings").delete().eq("id", order.blocking_booking_id);
    }
    if (!order.session_date) {
      if (order.blocking_booking_id) await db.from("newborn_package_orders").update({ blocking_booking_id: null }).eq("id", order.id);
      return { error: null };
    }
    const [start, end] = newbornSessionWindow(order.session_time);
    const { data: booking, error } = await db
      .from("bookings")
      .insert({
        user_id: adminUserId,
        session_date: order.session_date,
        start_time: start,
        end_time: end,
        slots: NEWBORN_SESSION_HOURS * 2,
        package: "newborn",
        price: order.total_price ?? 0,
        status: "confirmed",
        deposit_status: "not_required",
        deposit_amount: 0,
        balance_amount: 0,
        contact_name: order.contact_name,
        contact_phone: order.contact_phone,
        notes: `חסימת יומן אוטומטית — הזמנת חבילת ניו-בורן (מזהה ${order.id.slice(0, 8)})`,
      })
      .select("id")
      .single();
    if (error || !booking) return { error: error?.message ?? "יצירת חסימת השעות ביומן הסטודיו נכשלה" };
    // Best-effort link-back — if blocking_booking_id itself isn't live on
    // this database yet (same schema-deploy-lag class as session_time/
    // birth_basket_used), the actual blocking booking row above was still
    // created successfully (that's what really stops a double-booking), so
    // this is reported as success regardless; only future re-sync/cleanup
    // on this specific order loses track of which booking row to replace.
    const { error: linkError } = await db.from("newborn_package_orders").update({ blocking_booking_id: booking.id }).eq("id", order.id);
    if (linkError) console.error("[SWEETBABY] newborn order booking-block created but link-back failed (likely missing column)", linkError);
    // Reads the row back with a FRESH, independent select — not just
    // trusting the insert's own .select() response — so a genuine
    // "created but somehow not visible again" case (RLS oddity, replica
    // lag) is caught here instead of reporting a false success. Added
    // after a real report of the block silently not showing up anywhere.
    const { data: verify, error: verifyError } = await db.from("bookings").select("id, session_date, start_time, end_time").eq("id", booking.id).maybeSingle();
    if (verifyError || !verify) {
      return { error: `נוצר (מזהה ${booking.id.slice(0, 8)}) אבל קריאה חוזרת מיד אחרי נכשלה: ${verifyError?.message ?? "לא נמצא"}` };
    }
    return { error: null, confirmed: { date: verify.session_date, start: String(verify.start_time).slice(0, 5), end: String(verify.end_time).slice(0, 5) } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[SWEETBABY] newborn order booking-block sync failed", e);
    return { error: message };
  }
}

// newborn_package_orders is a very recent table — cast past the generated
// types until they're regenerated against the live schema (same pattern
// used for bot_knowledge_notes/image_hash elsewhere in this codebase).

export const listNewbornOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const createSchema = z.object({
  package_id: z.string().min(1),
  addon_ids: z.array(z.string()).default([]),
  contact_name: z.string().trim().min(1).max(120),
  contact_phone: z.string().trim().min(5).max(40),
  contact_email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  session_date: z.string().min(10).max(10).optional().nullable(), // "YYYY-MM-DD"
  session_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  birth_basket_used: z.boolean().optional().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const createNewbornOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const pkg = findNewbornPackage(data.package_id);
    if (!pkg) throw new Error("חבילה לא מוכרת");
    const chosenAddons = NEWBORN_ADDONS.filter((a) => data.addon_ids.includes(a.id));
    const addonsPrice = chosenAddons.reduce((sum, a) => sum + a.price, 0);
    const payload = {
      package_id: pkg.id,
      addons: chosenAddons,
      base_price: pkg.price,
      addons_price: addonsPrice,
      total_price: pkg.price + addonsPrice,
      contact_name: data.contact_name,
      contact_phone: data.contact_phone,
      contact_email: data.contact_email || null,
      session_date: data.session_date || null,
      session_time: data.session_time || null,
      birth_basket_used: data.birth_basket_used ?? false,
      notes: data.notes || null,
    };
    let { data: row, error } = await (context.supabase as any).from("newborn_package_orders").insert(payload).select("*").single();
    let schemaFallback = false;
    if (error) {
      // session_time/birth_basket_used are recently added columns — if this
      // deployment's database migration hasn't actually landed yet, the
      // WHOLE insert fails (a real report: "ההזמנה לא נשלחת, כותב שגיאה").
      // Same defensive fallback already used for draft_booking in
      // api.yemot.ivr.ts (selectVoiceSession/upsertVoiceSession) — retry
      // without the new columns so creating an order never hard-fails over
      // a schema-deploy lag; worst case the two new fields are silently
      // dropped until the migration catches up.
      console.error("[SWEETBABY] newborn order insert with new columns failed, retrying without them", error);
      const { session_time: _st, birth_basket_used: _bb, ...withoutNewCols } = payload;
      const retry = await (context.supabase as any).from("newborn_package_orders").insert(withoutNewCols).select("*").single();
      row = retry.data;
      error = retry.error;
      schemaFallback = !error;
    }
    if (error || !row) throw new Error(error?.message ?? "יצירת ההזמנה נכשלה");
    // Best-effort, never blocks the order itself — see each sync function's own doc comment.
    // bookingBlock is the one that actually stops a double-booking
    // (syncNewbornBookingBlock's own comment) — calendarError is the
    // secondary, visual-only Google Calendar mirror.
    const [calendarError, bookingBlock] = await Promise.all([
      syncNewbornCalendarEvent(context.supabase, row),
      syncNewbornBookingBlock(context.supabase, context.userId, row),
    ]);
    // `schemaFallback` tells the caller the order WAS created but the
    // shooting-time/birth-basket fields could NOT be saved (the columns
    // aren't live on this database yet) — surfaced as an honest warning in
    // the admin UI instead of silently succeeding while quietly dropping
    // what she actually typed (this is exactly why the calendar event can
    // end up at the default 10:00 instead of the real chosen time: the time
    // never made it into the row for syncNewbornCalendarEvent to read).
    // `_bookingBlockConfirmed` carries back the ACTUAL date/time read from a
    // fresh, independent select right after insert (syncNewbornBookingBlock's
    // own doc comment) — real proof for the admin UI, not just "trust me".
    return {
      ...row,
      _schemaFallback: schemaFallback,
      _calendarError: calendarError,
      _bookingBlockError: bookingBlock.error,
      _bookingBlockConfirmed: bookingBlock.confirmed ?? null,
    };
  });

const toggleSchema = z.object({
  id: z.string().uuid(),
  step_key: z.enum(NEWBORN_TIMELINE_STEP_KEYS as [string, ...string[]]),
  done: z.boolean(),
});

/** Marks one pipeline step done/not-done — the column name is built from a zod-enum-validated whitelist (NEWBORN_TIMELINE_STEP_KEYS), never raw client input, before ever touching the query. */
export const toggleNewbornOrderStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const column = `${data.step_key}_at`;
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ [column]: data.done ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateContactSchema = z.object({
  id: z.string().uuid(),
  contact_name: z.string().trim().min(1).max(120).optional(),
  contact_phone: z.string().trim().min(5).max(40).optional(),
  contact_email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable().optional(),
  session_date: z.string().min(10).max(10).optional().nullable(),
  session_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  birth_basket_used: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

// Fields that, if changed, mean the calendar event AND the availability-
// blocking booking (if either exists) need re-syncing — everything both of
// them actually depend on.
const CALENDAR_RELEVANT_FIELDS = new Set(["contact_name", "contact_email", "contact_phone", "session_date", "session_time"]);

export const updateNewbornOrderContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateContactSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = k === "contact_email" && v === "" ? null : v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    let { error } = await (context.supabase as any).from("newborn_package_orders").update(patch).eq("id", id);
    let schemaFallback = false;
    if (error && ("session_time" in patch || "birth_basket_used" in patch)) {
      // Same schema-deploy-lag fallback as createNewbornOrder above — retry
      // without the possibly-missing new columns rather than failing the
      // whole save (which would also silently drop any OTHER field in the
      // same edit, e.g. a name/phone fix bundled with a time change).
      console.error("[SWEETBABY] newborn order update with new columns failed, retrying without them", error);
      const { session_time: _st, birth_basket_used: _bb, ...withoutNewCols } = patch;
      if (Object.keys(withoutNewCols).length > 0) {
        const retry = await (context.supabase as any).from("newborn_package_orders").update(withoutNewCols).eq("id", id);
        error = retry.error;
      } else {
        error = null;
      }
      schemaFallback = !error;
    }
    if (error) throw new Error(error.message);

    let calendarError: string | null = null;
    let bookingBlock: BookingBlockResult = { error: null };
    const touchesCalendar = Object.keys(patch).some((k) => CALENDAR_RELEVANT_FIELDS.has(k));
    if (touchesCalendar) {
      // Drop session_time/blocking_booking_id from the select when either
      // isn't live yet — the read would otherwise fail outright over a
      // missing column, which would skip re-syncing EVERYTHING (including
      // the calendar, which has nothing to do with the missing field) for a
      // plain name/date change.
      const baseCols = "id, contact_name, contact_phone, contact_email, session_date, total_price, google_event_id";
      let { data: fresh } = await (context.supabase as any)
        .from("newborn_package_orders")
        .select(`${baseCols}, session_time, blocking_booking_id`)
        .eq("id", id)
        .maybeSingle();
      if (!fresh) {
        const retry = await (context.supabase as any).from("newborn_package_orders").select(baseCols).eq("id", id).maybeSingle();
        fresh = retry.data;
      }
      if (fresh) {
        const freshWithTime = { ...fresh, session_time: fresh.session_time ?? null };
        [calendarError, bookingBlock] = await Promise.all([
          syncNewbornCalendarEvent(context.supabase, freshWithTime),
          syncNewbornBookingBlock(context.supabase, context.userId, freshWithTime),
        ]);
      }
    }
    // See createNewbornOrder's matching comments — _schemaFallback,
    // _calendarError and _bookingBlockError tell the admin UI exactly what
    // didn't save/sync, instead of silently reporting success while
    // quietly dropping something she just typed or failing to block the
    // slot. _bookingBlockConfirmed is real proof (a fresh independent
    // read-back), not just "the insert didn't error".
    return {
      ok: true,
      _schemaFallback: schemaFallback,
      _calendarError: calendarError,
      _bookingBlockError: bookingBlock.error,
      _bookingBlockConfirmed: bookingBlock.confirmed ?? null,
    };
  });

export const deleteNewbornOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // blocking_booking_id is a newer column than google_event_id — select
    // with a fallback so a missing column doesn't also break the
    // already-working google_event_id cleanup.
    let { data: existing } = await (context.supabase as any)
      .from("newborn_package_orders")
      .select("google_event_id, blocking_booking_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) {
      const retry = await (context.supabase as any).from("newborn_package_orders").select("google_event_id").eq("id", data.id).maybeSingle();
      existing = retry.data;
    }
    const { error } = await (context.supabase as any).from("newborn_package_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (existing?.google_event_id) {
      // Best-effort — an order that's already deleted shouldn't fail the whole action over a stray calendar entry.
      import("@/integrations/google/calendar.server")
        .then(({ deleteGoogleCalendarEvent }) => deleteGoogleCalendarEvent(existing.google_event_id))
        .catch((e) => console.error("[SWEETBABY] newborn order delete: calendar cleanup failed", e));
    }
    if (existing?.blocking_booking_id) {
      // Best-effort — same reasoning: never fail the delete itself over cleanup of the now-orphaned blocking booking row.
      (context.supabase as any)
        .from("bookings")
        .delete()
        .eq("id", existing.blocking_booking_id)
        .then(({ error: delErr }: any) => {
          if (delErr) console.error("[SWEETBABY] newborn order delete: booking-block cleanup failed", delErr);
        });
    }
    return { ok: true };
  });

const paymentSchema = z.object({ id: z.string().uuid(), amount_paid: z.number().nonnegative().max(1000000) });

/**
 * Sets the total amount paid so far on an order (not a delta — the admin
 * types the running total, same as editing a balance field directly).
 * last_payment_at is stamped "now" every time this runs, purely so the
 * dashboard's "paid this month" stat has something to filter on — it's a
 * snapshot approximation (whichever orders were last touched this month),
 * not a real payment ledger with per-transaction history.
 */
export const updateNewbornOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ amount_paid: data.amount_paid, last_payment_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Stamps gallery_opened_at (idempotent — safe to call every time "פתיחת גלריה" is clicked) so the dashboard can count how many orders actually have a gallery started. */
export const markNewbornGalleryOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ gallery_opened_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("gallery_opened_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
