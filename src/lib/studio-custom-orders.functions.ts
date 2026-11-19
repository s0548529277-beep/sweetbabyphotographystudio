// Admin CRUD for "חבילת סטודיו מותאמת אישית" — the third kind in the unified client page
// (/admin/newborn-packages, next to newborn and outdoor). Booking one RESERVES the studio:
// it creates a real calendar-block row in `bookings` (same mechanism as newborn orders, see
// syncNewbornBookingBlock in newborn-orders.functions.ts) plus a Google Calendar event.
//
// Kept in its OWN table (studio_custom_orders) on purpose: newborn_package_orders has a trigger
// that mirrors rows to the photographer site, and this kind must never reach it.
//
// The block row uses package "newborn" like the newborn block does, because finance, the admin
// overview and the bots already skip that package (a block row is not income — the order's own
// payments are). The calendar title deliberately avoids the "סטודיו ·" prefix: a scheduled task
// treats those events as paying studio renters and books the family room for them.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

const DEFAULT_START = "10:00";
const DEFAULT_HOURS = 2;

function toMinutes(t: string): number {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fromMinutes(min: number): string {
  const capped = Math.min(Math.max(min, 0), 23 * 60 + 59);
  return `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
}

/** `[start, end]` ("HH:MM"), shared by the calendar event and the availability block so both always agree. */
export function studioCustomWindow(
  sessionTime: string | null,
  durationHours: number | null | undefined,
): [string, string] {
  const start = sessionTime || DEFAULT_START;
  const hours = durationHours && durationHours > 0 ? durationHours : DEFAULT_HOURS;
  return [start, fromMinutes(toMinutes(start) + Math.round(hours * 60))];
}

type OrderRow = {
  id: string;
  package_name?: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  session_date: string | null;
  session_time: string | null;
  duration_hours: number | null;
  total_price: number | null;
  blocking_booking_id: string | null;
  google_event_id: string | null;
};

/** Returns null on success / nothing to do, else the real error text. Never throws. */
async function syncCalendarEvent(db: any, order: OrderRow): Promise<string | null> {
  try {
    const { createGoogleCalendarEvent, deleteGoogleCalendarEvent } =
      await import("@/integrations/google/calendar.server");
    if (order.google_event_id) await deleteGoogleCalendarEvent(order.google_event_id).catch(() => {});
    if (!order.session_date) {
      if (order.google_event_id)
        await db.from("studio_custom_orders").update({ google_event_id: null }).eq("id", order.id);
      return null;
    }
    const [start, end] = studioCustomWindow(order.session_time, order.duration_hours);
    const event = await createGoogleCalendarEvent({
      summary: `חבילה מותאמת · ${order.contact_name}`,
      description: [
        order.package_name ? `חבילה: ${order.package_name}` : null,
        order.contact_email ? `מייל: ${order.contact_email}` : null,
        `טלפון: ${order.contact_phone}`,
      ]
        .filter(Boolean)
        .join("\n"),
      startISO: `${order.session_date}T${start}:00`,
      endISO: `${order.session_date}T${end}:00`,
      location: "תלמוד ירושלמי 24, בית שמש",
      attendees: [],
    });
    if (!event) return "יצירת האירוע ביומן החזירה תוצאה ריקה";
    await db.from("studio_custom_orders").update({ google_event_id: event.id }).eq("id", order.id);
    return null;
  } catch (e) {
    console.error("[SWEETBABY] studio custom order calendar sync failed", e);
    return e instanceof Error ? e.message : String(e);
  }
}

type BlockResult = {
  error: string | null;
  overlap: string | null;
  confirmed?: { date: string; start: string; end: string };
};

/** THE part that stops a renter from booking the studio in this window: a real `bookings` row. */
async function syncBookingBlock(db: any, adminUserId: string, order: OrderRow): Promise<BlockResult> {
  try {
    if (order.blocking_booking_id) {
      await db.from("bookings").delete().eq("id", order.blocking_booking_id);
    }
    if (!order.session_date) {
      if (order.blocking_booking_id)
        await db.from("studio_custom_orders").update({ blocking_booking_id: null }).eq("id", order.id);
      return { error: null, overlap: null };
    }
    const [start, end] = studioCustomWindow(order.session_time, order.duration_hours);

    // Warn (never refuse) when another confirmed booking already sits in this window.
    let overlap: string | null = null;
    const { data: sameDay } = await db
      .from("bookings")
      .select("start_time, end_time, contact_name, package")
      .eq("session_date", order.session_date)
      .eq("status", "confirmed");
    const hit = (sameDay ?? []).find(
      (b: any) => toMinutes(b.start_time) < toMinutes(end) && toMinutes(b.end_time) > toMinutes(start),
    );
    if (hit) {
      overlap = `${hit.contact_name ?? "הזמנה קיימת"} (${String(hit.start_time).slice(0, 5)}–${String(hit.end_time).slice(0, 5)})`;
    }

    const { data: booking, error } = await db
      .from("bookings")
      .insert({
        user_id: adminUserId,
        session_date: order.session_date,
        start_time: start,
        end_time: end,
        slots: Math.max(1, Math.round(((toMinutes(end) - toMinutes(start)) / 60) * 2)),
        package: "newborn",
        price: order.total_price ?? 0,
        status: "confirmed",
        deposit_status: "not_required",
        deposit_amount: 0,
        balance_amount: 0,
        contact_name: order.contact_name,
        contact_phone: order.contact_phone,
        notes: `חסימת יומן אוטומטית — חבילת סטודיו מותאמת אישית (מזהה ${order.id.slice(0, 8)})`,
      })
      .select("id")
      .single();
    if (error || !booking)
      return { error: error?.message ?? "יצירת חסימת השעות ביומן הסטודיו נכשלה", overlap };
    const { error: linkError } = await db
      .from("studio_custom_orders")
      .update({ blocking_booking_id: booking.id })
      .eq("id", order.id);
    if (linkError) console.error("[SWEETBABY] studio custom order block link-back failed", linkError);

    // Independent re-read — proof that the block is really visible, not just "insert returned ok".
    const { data: verify, error: verifyError } = await db
      .from("bookings")
      .select("id, session_date, start_time, end_time")
      .eq("id", booking.id)
      .maybeSingle();
    if (verifyError || !verify)
      return {
        error: `נוצר (מזהה ${booking.id.slice(0, 8)}) אבל קריאה חוזרת נכשלה: ${verifyError?.message ?? "לא נמצא"}`,
        overlap,
      };
    return {
      error: null,
      overlap,
      confirmed: {
        date: verify.session_date,
        start: String(verify.start_time).slice(0, 5),
        end: String(verify.end_time).slice(0, 5),
      },
    };
  } catch (e) {
    console.error("[SWEETBABY] studio custom order booking-block sync failed", e);
    return { error: e instanceof Error ? e.message : String(e), overlap: null };
  }
}

async function syncAll(db: any, adminUserId: string, row: OrderRow) {
  const [calendarError, block] = await Promise.all([
    syncCalendarEvent(db, row),
    syncBookingBlock(db, adminUserId, row),
  ]);
  return {
    _calendarError: calendarError,
    _bookingBlockError: block.error,
    _bookingBlockConfirmed: block.confirmed ?? null,
    _overlap: block.overlap,
  };
}

export const listStudioCustomOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("studio_custom_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const baseFields = {
  package_name: z.string().trim().min(1).max(120).default("סטודיו מותאם אישית"),
  package_description: z.string().trim().max(1000).optional().nullable(),
  total_price: z.number().min(0).max(1_000_000).default(0),
  contact_name: z.string().trim().min(1).max(120),
  contact_phone: z.string().trim().min(5).max(40),
  contact_email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  session_date: z.string().length(10).optional().nullable(), // YYYY-MM-DD
  session_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  duration_hours: z.number().min(0.5).max(12).default(2),
  notes: z.string().trim().max(1000).optional().nullable(),
};

const createSchema = z.object(baseFields);

export const createStudioCustomOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await (context.supabase as any)
      .from("studio_custom_orders")
      .insert({
        package_name: data.package_name,
        package_description: data.package_description || null,
        total_price: data.total_price,
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        contact_email: data.contact_email || null,
        session_date: data.session_date || null,
        session_time: data.session_time || null,
        duration_hours: data.duration_hours,
        notes: data.notes || null,
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "יצירת ההזמנה נכשלה");
    const sync = await syncAll(context.supabase, context.userId, row);
    return { ...row, ...sync };
  });

const updateSchema = createSchema.partial().extend({ id: z.string().uuid() });

export const updateStudioCustomOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      patch[k] = v === "" ? null : v;
    }
    const { data: row, error } = await (context.supabase as any)
      .from("studio_custom_orders")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "עדכון ההזמנה נכשל");
    const sync = await syncAll(context.supabase, context.userId, row);
    return { ...row, ...sync };
  });

export const deleteStudioCustomOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const { data: existing } = await db
      .from("studio_custom_orders")
      .select("google_event_id, blocking_booking_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await db.from("studio_custom_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    // Best-effort cleanup — a stray calendar entry / block row must not fail the delete itself.
    if (existing?.google_event_id) {
      try {
        const { deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
        await deleteGoogleCalendarEvent(existing.google_event_id);
      } catch (e) {
        console.error("[SWEETBABY] studio custom order delete: calendar cleanup failed", e);
      }
    }
    if (existing?.blocking_booking_id) {
      try {
        await db.from("bookings").delete().eq("id", existing.blocking_booking_id);
      } catch (e) {
        console.error("[SWEETBABY] studio custom order delete: block cleanup failed", e);
      }
    }
    return { ok: true };
  });

export const updateStudioCustomOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), amount_paid: z.number().min(0).max(1_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("studio_custom_orders")
      .update({
        amount_paid: data.amount_paid,
        last_payment_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const STUDIO_CUSTOM_STEP_KEYS = ["shoot_done", "payment_done"] as const;

export const toggleStudioCustomOrderStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        step_key: z.enum(STUDIO_CUSTOM_STEP_KEYS),
        done: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("studio_custom_orders")
      .update({ [`${data.step_key}_at`]: data.done ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
