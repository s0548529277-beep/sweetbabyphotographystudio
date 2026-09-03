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

async function syncNewbornCalendarEvent(
  db: any,
  order: { id: string; contact_name: string; contact_email: string | null; session_date: string | null; session_time: string | null; google_event_id?: string | null },
): Promise<void> {
  try {
    const { createGoogleCalendarEvent, deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
    if (order.google_event_id) {
      await deleteGoogleCalendarEvent(order.google_event_id).catch(() => {});
    }
    if (!order.session_date) {
      if (order.google_event_id) await db.from("newborn_package_orders").update({ google_event_id: null }).eq("id", order.id);
      return;
    }
    const time = order.session_time || DEFAULT_SESSION_TIME;
    const [h, m] = time.split(":").map(Number);
    const endMin = h * 60 + m + NEWBORN_SESSION_HOURS * 60;
    const endTime = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    const event = await createGoogleCalendarEvent({
      summary: `ניו-בורן · ${order.contact_name}`,
      description: order.contact_email ? `מייל: ${order.contact_email}` : undefined,
      startISO: `${order.session_date}T${time}:00`,
      endISO: `${order.session_date}T${endTime}:00`,
      location: "תלמוד ירושלמי 24, בית שמש",
      attendees: order.contact_email ? [order.contact_email] : [],
    });
    await db.from("newborn_package_orders").update({ google_event_id: event?.id ?? null }).eq("id", order.id);
  } catch (e) {
    console.error("[SWEETBABY] newborn order calendar sync failed", e);
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
    }
    if (error || !row) throw new Error(error?.message ?? "יצירת ההזמנה נכשלה");
    // Best-effort, never blocks the order itself — see syncNewbornCalendarEvent's own doc comment.
    await syncNewbornCalendarEvent(context.supabase, row);
    return row;
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

// Fields that, if changed, mean the calendar event (if any) needs re-syncing —
// everything the event's summary/time/attendee actually depends on.
const CALENDAR_RELEVANT_FIELDS = new Set(["contact_name", "contact_email", "session_date", "session_time"]);

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
    }
    if (error) throw new Error(error.message);

    const touchesCalendar = Object.keys(patch).some((k) => CALENDAR_RELEVANT_FIELDS.has(k));
    if (touchesCalendar) {
      const { data: fresh } = await (context.supabase as any)
        .from("newborn_package_orders")
        .select("id, contact_name, contact_email, session_date, session_time, google_event_id")
        .eq("id", id)
        .maybeSingle();
      if (fresh) await syncNewbornCalendarEvent(context.supabase, fresh);
    }
    return { ok: true };
  });

export const deleteNewbornOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: existing } = await (context.supabase as any).from("newborn_package_orders").select("google_event_id").eq("id", data.id).maybeSingle();
    const { error } = await (context.supabase as any).from("newborn_package_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (existing?.google_event_id) {
      // Best-effort — an order that's already deleted shouldn't fail the whole action over a stray calendar entry.
      import("@/integrations/google/calendar.server")
        .then(({ deleteGoogleCalendarEvent }) => deleteGoogleCalendarEvent(existing.google_event_id))
        .catch((e) => console.error("[SWEETBABY] newborn order delete: calendar cleanup failed", e));
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
