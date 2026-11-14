import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addMinutesHHMM,
  editNeedsApproval,
  sessionStartMs,
  CHANGE_LABELS,
  type BookingChanges,
  type EditKind,
  type OrderChanges,
} from "@/lib/order-edit";
import { naiveHHMM, naiveIsraelMs } from "@/lib/naive-time";

/**
 * Customer edits of her own studio booking / props order (owner request 2026-11-14).
 *
 * - The "עריכת הזמנה" button in the mails opens /edit-order (login required).
 * - Edit at least 24h before the session -> applied at once (calendar event + door code are re-issued when the
 *   booking was already confirmed). Edit less than 24h before the session (judged by the current AND the new
 *   start) -> stored in order_edit_requests as 'pending'; the admin gets a notification + a mail and approves or
 *   rejects it in /admin/orders. Nothing changes until she approves.
 * - Studio booking: date + start time (same length, so the price stays) + a note. Props order: pickup / return
 *   time (same dates and the same number of rental days) + a note. Anything else goes through the chat / the studio.
 */

const SITE = "https://sweetbabyphoto.shop";
const STUDIO_EMAIL = "s0548529277@gmail.com";
const kindSchema = z.enum(["booking", "order"]);
const EDITABLE_STATUSES = ["pending", "confirmed"];

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

const BOOKING_COLS =
  "id, user_id, status, deposit_status, session_date, start_time, end_time, slots, package, price, deposit_amount, balance_amount, balance_method, notes, reserved_items, contact_name, contact_phone, contact_email, google_event_id, door_code, ttlock_lock_id, ttlock_keyboard_pwd_id, family_room_slots";
const ORDER_COLS =
  "id, user_id, status, session_date, return_date, pickup_at, return_at, total, notes, balance_method, contact_name, contact_phone, contact_email, camera_model, google_event_id, door_code, ttlock_lock_id, ttlock_keyboard_pwd_id";

async function loadRow(db: any, kind: EditKind, id: string): Promise<any> {
  const { data, error } = await db
    .from(kind === "booking" ? "bookings" : "orders")
    .select(kind === "booking" ? BOOKING_COLS : ORDER_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error(kind === "booking" ? "השריון לא נמצא" : "ההזמנה לא נמצאה");
  return data;
}

async function loadOwnRow(db: any, kind: EditKind, id: string, userId: string): Promise<any> {
  const row = await loadRow(db, kind, id);
  if (row.user_id !== userId) throw new Error("אין הרשאה לערוך הזמנה זו");
  return row;
}

/** Customer-visible reason this row cannot be edited at all, or null. */
function blockedReason(kind: EditKind, row: any): string | null {
  if (!EDITABLE_STATUSES.includes(String(row.status))) {
    return row.status === "cancelled" ? "ההזמנה בוטלה" : "ההזמנה כבר פעילה או הסתיימה — לשינוי נא לפנות לצוות הסטודיו";
  }
  const start = currentStartMs(kind, row);
  if (start != null && start <= Date.now()) return "המועד כבר התחיל או עבר — לא ניתן לערוך";
  return null;
}

function currentStartMs(kind: EditKind, row: any): number | null {
  if (kind === "booking") return sessionStartMs(row.session_date, String(row.start_time));
  if (row.pickup_at) return naiveIsraelMs(String(row.pickup_at));
  if (row.session_date) return sessionStartMs(row.session_date, "09:00");
  return null;
}

async function accountEmail(db: any, userId: string): Promise<string | undefined> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return data?.user?.email ?? undefined;
  } catch {
    return undefined;
  }
}

async function customerEmailsOf(db: any, kind: EditKind, row: any): Promise<string[]> {
  const { pickBookingEmail } = await import("@/lib/bookings.functions");
  const acc = await accountEmail(db, row.user_id);
  const out: string[] = [];
  const typed = pickBookingEmail(row.contact_email, undefined);
  if (typed) out.push(typed);
  const account = pickBookingEmail(undefined, acc);
  if (account) out.push(account);
  return Array.from(new Set(out.map((e) => e.toLowerCase())));
}

/* ------------------------------------------------------------------ */
/* Validation shared by "submit" (so a doomed request is never filed) and "apply"                */
/* ------------------------------------------------------------------ */

async function assertBookingSlotFree(db: any, row: any, date: string, start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const { bookingBlocksSlot } = await import("@/lib/availability.server");
  const { data: existing, error } = await db
    .from("bookings")
    .select("id, start_time, end_time, status, deposit_status, created_at, notes")
    .eq("session_date", date)
    .neq("status", "cancelled")
    .neq("id", row.id);
  if (error) throw new Error(error.message);
  for (const b of (existing ?? []).filter((x: any) => bookingBlocksSlot(x))) {
    const [bh, bm] = String(b.start_time).split(":").map(Number);
    const [ch, cm] = String(b.end_time).split(":").map(Number);
    if (startMin < ch * 60 + cm && endMin > bh * 60 + bm) throw new Error("הזמן שבחרת כבר תפוס. בחרי שעה אחרת.");
  }
  try {
    const { listGoogleCalendarBusy } = await import("@/integrations/google/calendar.server");
    const gbusy = await listGoogleCalendarBusy(date, date);
    // This booking's own calendar event (when confirmed) must not block its own new window.
    const [oh, om] = String(row.start_time).slice(0, 5).split(":").map(Number);
    const [oeh, oem] = String(row.end_time).slice(0, 5).split(":").map(Number);
    const ownS = oh * 60 + om;
    const ownE = oeh * 60 + oem;
    for (const [bs, be] of gbusy[date] ?? []) {
      if (row.google_event_id && row.session_date === date && bs === ownS && be === ownE) continue;
      if (startMin < be && endMin > bs) throw new Error("הזמן שבחרת כבר תפוס ביומן הסטודיו. בחרי שעה אחרת.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("תפוס")) throw e;
    console.error("[SWEETBABY] edit-order calendar conflict check failed", e);
  }
}

/** Throws a Hebrew error when this booking change is not allowed; returns the new end time. */
async function validateBookingChanges(db: any, row: any, changes: BookingChanges): Promise<{ newDate: string; newStart: string; newEnd: string; moved: boolean }> {
  const { isMorningPackage } = await import("@/lib/bookings.functions");
  const oldStart = String(row.start_time).slice(0, 5);
  const newDate = changes.session_date ?? row.session_date;
  const newStart = changes.start_time ?? oldStart;
  const moved = newDate !== row.session_date || newStart !== oldStart;
  const newEnd = addMinutesHHMM(newStart, Number(row.slots) * 30);
  if (!moved) return { newDate, newStart, newEnd, moved };

  if (Array.isArray(row.reserved_items) && row.reserved_items.length > 0) {
    throw new Error("בשריון הזה שוריינו אביזרים לתאריך — לשינוי מועד נא לפנות לצוות הסטודיו או בצ׳אט.");
  }
  if (sessionStartMs(newDate, newStart) <= Date.now()) throw new Error("לא ניתן לבחור מועד שכבר עבר");
  if (isMorningPackage(Number(row.slots), newStart) !== isMorningPackage(Number(row.slots), oldStart)) {
    throw new Error("בשעה הזו המחיר שונה (חבילת בוקר/ערב) — לשינוי כזה נא לפנות לצוות הסטודיו או בצ׳אט.");
  }
  if (newEnd <= newStart) throw new Error("השעה שנבחרה חורגת מסוף היום — בחרי שעה מוקדמת יותר.");
  await assertBookingSlotFree(db, row, newDate, newStart, newEnd);
  return { newDate, newStart, newEnd, moved };
}

async function validateOrderChanges(row: any, changes: OrderChanges): Promise<{ pickup: string | null; ret: string | null; moved: boolean }> {
  const { isWithinPropsHandoffHours, PROPS_HANDOFF_NOTE } = await import("@/lib/props-hours");
  const oldPickup = naiveHHMM(row.pickup_at);
  const oldReturn = naiveHHMM(row.return_at);
  const pickup = changes.pickup_time ?? oldPickup;
  const ret = changes.return_time ?? oldReturn;
  const moved = pickup !== oldPickup || ret !== oldReturn;
  if (!moved) return { pickup, ret, moved };
  if (changes.pickup_time && !isWithinPropsHandoffHours(changes.pickup_time)) throw new Error(PROPS_HANDOFF_NOTE);
  if (changes.return_time && !isWithinPropsHandoffHours(changes.return_time)) throw new Error(PROPS_HANDOFF_NOTE);
  const pickupDate = String(row.session_date ?? row.pickup_at ?? "").slice(0, 10);
  const returnDate = String(row.return_date ?? row.return_at ?? "").slice(0, 10);
  if (pickupDate && returnDate && pickupDate === returnDate && pickup && ret && ret <= pickup) {
    throw new Error("שעת ההחזרה חייבת להיות אחרי שעת האיסוף");
  }
  if (pickup && ret && pickupDate && returnDate) {
    const { computeDayMultiplier } = await import("@/lib/orders.functions");
    const before = computeDayMultiplier(`${pickupDate}T${oldPickup ?? "09:00"}:00`, `${returnDate}T${oldReturn ?? "18:00"}:00`);
    const after = computeDayMultiplier(`${pickupDate}T${pickup}:00`, `${returnDate}T${ret}:00`);
    if (before !== after) {
      throw new Error("השינוי הזה משנה את מספר ימי ההשכרה (ואת המחיר) — לשינוי כזה נא לפנות לצוות הסטודיו או בצ׳אט.");
    }
  }
  return { pickup, ret, moved };
}

/** Only the fields that really differ from the stored row (plus the note). */
function diffChanges(kind: EditKind, row: any, input: any): BookingChanges & OrderChanges {
  const out: Record<string, string> = {};
  if (kind === "booking") {
    if (input.session_date && input.session_date !== row.session_date) out.session_date = input.session_date;
    if (input.start_time && input.start_time !== String(row.start_time).slice(0, 5)) out.start_time = input.start_time;
  } else {
    if (input.pickup_time && input.pickup_time !== naiveHHMM(row.pickup_at)) out.pickup_time = input.pickup_time;
    if (input.return_time && input.return_time !== naiveHHMM(row.return_at)) out.return_time = input.return_time;
  }
  if (input.note && String(input.note).trim()) out.note = String(input.note).trim();
  return out;
}

/* ------------------------------------------------------------------ */
/* Applying an edit (customer edit >24h ahead, or the admin's approval)                          */
/* ------------------------------------------------------------------ */

const stamp = () => new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
const appendNote = (old: string | null | undefined, note: string, who: string) => [old, `${who} (${stamp()}): ${note}`].filter(Boolean).join("\n");

async function applyBookingEdit(id: string, changes: BookingChanges, who: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db: any = supabaseAdmin;
  const b = await loadRow(db, "booking", id);
  if (!EDITABLE_STATUSES.includes(String(b.status))) throw new Error("ההזמנה כבר לא ניתנת לעריכה");
  const v = await validateBookingChanges(db, b, changes);

  const update: Record<string, unknown> = {};
  if (v.moved) {
    update.session_date = v.newDate;
    update.start_time = v.newStart;
    update.end_time = v.newEnd;
    update.reminder_sent_at = null;
    update.reminder_4h_sent_at = null;
  }
  if (changes.note) update.notes = appendNote(b.notes, changes.note, who);
  if (Object.keys(update).length === 0) return;
  const { error } = await db.from("bookings").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  const emails = await customerEmailsOf(db, "booking", b);
  let doorCode: string | null = b.door_code ?? null;

  if (v.moved && (b.google_event_id || b.door_code || b.ttlock_keyboard_pwd_id)) {
    // Calendar event: replace the old one with one at the new time.
    if (b.google_event_id) {
      try {
        const { deleteGoogleCalendarEvent, createGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
        try { await deleteGoogleCalendarEvent(b.google_event_id); } catch (e) { console.error("[SWEETBABY] edit-order gcal delete failed", e); }
        const event = await createGoogleCalendarEvent({
          summary: `סטודיו · ${b.contact_name ?? ""}`.trim(),
          description: [`טלפון: ${b.contact_phone ?? ""}`, `מחיר: ₪${b.price}`, "מקדמה שולמה ✓", "(מועד שונה בעריכת הזמנה)", b.notes ? `הערות: ${b.notes}` : null].filter(Boolean).join("\n"),
          startISO: `${v.newDate}T${v.newStart}:00`,
          endISO: `${v.newDate}T${v.newEnd}:00`,
          location: "תלמוד ירושלמי 24, בית שמש",
          attendees: emails,
        });
        await db.from("bookings").update({ google_event_id: event?.id ?? null }).eq("id", id);
      } catch (e) {
        console.error("[SWEETBABY] edit-order gcal recreate failed", e);
      }
    }
    // Door code: revoke the old passcode, issue a new one for the new window.
    if (b.ttlock_lock_id && b.ttlock_keyboard_pwd_id) {
      try {
        const { revokeDoorCode } = await import("@/integrations/ttlock/client.server");
        await revokeDoorCode(Number(b.ttlock_lock_id), Number(b.ttlock_keyboard_pwd_id));
      } catch (e) {
        console.error("[SWEETBABY] edit-order door code revoke failed", e);
      }
    }
    if (b.contact_phone && (b.door_code || b.ttlock_keyboard_pwd_id)) {
      try {
        const { issueDoorCodeForBooking } = await import("@/integrations/ttlock/client.server");
        const r = await issueDoorCodeForBooking({
          phone: b.contact_phone,
          date: v.newDate,
          startTime: v.newStart,
          endTime: v.newEnd,
          label: b.contact_name ? `${b.contact_name} סטודיו` : `הזמנה ${String(b.id).slice(0, 8)}`,
        });
        doorCode = r?.code ?? null;
        await db.from("bookings").update({ door_code: r?.code ?? null, ttlock_keyboard_pwd_id: r?.keyboardPwdId ?? null, ttlock_lock_id: r?.lockId ?? null }).eq("id", id);
      } catch (e) {
        console.error("[SWEETBABY] edit-order door code issue failed", e);
        doorCode = null;
      }
    }
  }

  try {
    const { buildBookingSummaryHtml } = await import("@/lib/orderSummary");
    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
    const html = buildBookingSummaryHtml({
      heading: "ההזמנה עודכנה ✓",
      intro: v.moved
        ? "ההזמנה עודכנה לפי הבקשה שלך. למטה הפרטים המעודכנים — כדאי לעבור עליהם ולוודא שהכול נכון. אם האיסוף בתוך 24 שעות, אנא התקשרי אלינו לוודא שהכול תקין: 054-8529277."
        : "ההערה שלך נוספה להזמנה. למטה סיכום ההזמנה.",
      booking: {
        id: b.id,
        contact_name: b.contact_name,
        session_date: update.session_date ? String(update.session_date) : b.session_date,
        start_time: update.start_time ? String(update.start_time) : b.start_time,
        end_time: update.end_time ? String(update.end_time) : b.end_time,
        price: b.price,
        deposit_amount: b.deposit_amount,
        balance_amount: b.balance_amount,
        balance_method: b.balance_method ?? null,
        notes: (update.notes as string | undefined) ?? b.notes,
        reserved_items: b.reserved_items ?? [],
      },
      includeIntake: false,
      doorCode,
      familyRoomSlots: v.moved ? null : b.family_room_slots ?? null,
    });
    await sendStudioAndCustomer({ customerEmail: emails, subject: `ההזמנה עודכנה — השכרת סטודיו #${String(b.id).slice(0, 8)} · Sweetbaby`, html });
  } catch (e) {
    console.error("[SWEETBABY] edit-order update mail failed", e);
  }
}

async function applyOrderEdit(id: string, changes: OrderChanges, who: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db: any = supabaseAdmin;
  const o = await loadRow(db, "order", id);
  if (!EDITABLE_STATUSES.includes(String(o.status))) throw new Error("ההזמנה כבר לא ניתנת לעריכה");
  const v = await validateOrderChanges(o, changes);
  const pickupDate = String(o.session_date ?? o.pickup_at ?? "").slice(0, 10);
  const returnDate = String(o.return_date ?? o.return_at ?? "").slice(0, 10);

  const update: Record<string, unknown> = {};
  if (v.moved) {
    if (v.pickup && pickupDate) update.pickup_at = `${pickupDate}T${v.pickup}:00`;
    if (v.ret && returnDate) update.return_at = `${returnDate}T${v.ret}:00`;
    update.reminder_sent_at = null;
    update.reminder_4h_sent_at = null;
  }
  if (changes.note) update.notes = appendNote(o.notes, changes.note, who);
  if (Object.keys(update).length === 0) return;
  const { error } = await db.from("orders").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  const emails = await customerEmailsOf(db, "order", o);
  let doorCode: string | null = o.door_code ?? null;

  if (v.moved && (o.google_event_id || o.door_code || o.ttlock_keyboard_pwd_id)) {
    if (o.google_event_id) {
      try {
        const { deleteGoogleCalendarEvent, createGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
        try { await deleteGoogleCalendarEvent(o.google_event_id); } catch (e) { console.error("[SWEETBABY] edit-order gcal delete (order) failed", e); }
        const startISO = `${pickupDate}T${v.pickup ?? "09:00"}:00`;
        const event = await createGoogleCalendarEvent({
          summary: `איסוף אביזרים · ${o.contact_name ?? ""}`,
          description: [
            `טלפון: ${o.contact_phone ?? ""}`,
            `איסוף: ${pickupDate} ${v.pickup ?? ""} · החזרה: ${returnDate} ${v.ret ?? ""}`,
            `סה״כ: ₪${o.total}`,
            "(שעה שונתה בעריכת הזמנה)",
            o.notes ? `הערות: ${o.notes}` : null,
          ].filter(Boolean).join("\n"),
          startISO,
          endISO: startISO.replace(/T\d{2}:/, `T${String(Math.min(23, Number((v.pickup ?? "09").slice(0, 2)) + 1)).padStart(2, "0")}:`),
          location: "תלמוד ירושלמי 24, בית שמש",
          attendees: emails,
          transparent: true,
        });
        await db.from("orders").update({ google_event_id: event?.id ?? null }).eq("id", id);
      } catch (e) {
        console.error("[SWEETBABY] edit-order gcal recreate (order) failed", e);
      }
    }
    if (o.ttlock_lock_id && o.ttlock_keyboard_pwd_id) {
      try {
        const { revokeDoorCode } = await import("@/integrations/ttlock/client.server");
        await revokeDoorCode(Number(o.ttlock_lock_id), Number(o.ttlock_keyboard_pwd_id));
      } catch (e) {
        console.error("[SWEETBABY] edit-order door code revoke (order) failed", e);
      }
    }
    if (o.contact_phone && v.pickup && v.ret && (o.door_code || o.ttlock_keyboard_pwd_id)) {
      try {
        const { issueDoorCodeForBooking } = await import("@/integrations/ttlock/client.server");
        const r = await issueDoorCodeForBooking({
          phone: o.contact_phone,
          date: pickupDate,
          startTime: v.pickup,
          endDate: returnDate,
          endTime: v.ret,
          label: o.contact_name ? `${o.contact_name} אביזרים` : `הזמנת אביזרים ${String(o.id).slice(0, 8)}`,
          excludeOvernightHours: true,
        });
        doorCode = r?.code ?? null;
        await db.from("orders").update({ door_code: r?.code ?? null, ttlock_keyboard_pwd_id: r?.keyboardPwdId ?? null, ttlock_lock_id: r?.lockId ?? null }).eq("id", id);
      } catch (e) {
        console.error("[SWEETBABY] edit-order door code issue (order) failed", e);
        doorCode = null;
      }
    }
  }

  try {
    const { buildPropsOrderSummaryHtml } = await import("@/lib/orderSummary");
    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
    const { computeDayMultiplier } = await import("@/lib/orders.functions");
    const { data: itemRows } = await db
      .from("order_items")
      .select("item_name, item_sku, quantity, price, items(image_url, description)")
      .eq("order_id", id);
    const lines = (itemRows ?? []).map((l: any) => ({
      item_name: l.item_name,
      item_sku: l.item_sku,
      quantity: l.quantity,
      price: Number(l.price) * Number(l.quantity),
      image_url: l.items?.image_url ?? null,
      description: l.items?.description ?? null,
    }));
    const pick = (update.pickup_at as string | undefined) ?? o.pickup_at;
    const ret = (update.return_at as string | undefined) ?? o.return_at;
    const html = buildPropsOrderSummaryHtml({
      heading: "ההזמנה עודכנה ✓",
      intro: v.moved
        ? "ההזמנה עודכנה לפי הבקשה שלך. למטה הפרטים המעודכנים — כדאי לעבור עליהם ולוודא שהכול נכון."
        : "ההערה שלך נוספה להזמנה. למטה סיכום ההזמנה.",
      order: {
        id: o.id,
        contact_name: o.contact_name,
        session_date: o.session_date ?? "",
        pickup_time: pick ? naiveHHMM(String(pick)) : null,
        return_date: o.return_date ?? "",
        return_time: ret ? naiveHHMM(String(ret)) : null,
        total: o.total,
        notes: (update.notes as string | undefined) ?? o.notes,
        balance_method: o.balance_method,
        day_multiplier: pick && ret ? computeDayMultiplier(String(pick), String(ret)) : 1,
        lines,
      },
      doorCode,
    });
    await sendStudioAndCustomer({ customerEmail: emails, subject: `ההזמנה עודכנה — השכרת אביזרים #${String(o.id).slice(0, 8)} · Sweetbaby`, html });
  } catch (e) {
    console.error("[SWEETBABY] edit-order update mail failed (order)", e);
  }
}

async function applyEdit(kind: EditKind, id: string, changes: any, who: string) {
  if (kind === "booking") await applyBookingEdit(id, changes, who);
  else await applyOrderEdit(id, changes, who);
}

/* ------------------------------------------------------------------ */
/* Customer: read the order + submit an edit                                                      */
/* ------------------------------------------------------------------ */

export const getEditableOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = await loadOwnRow(supabase, data.kind, data.id, userId);
    const reason = blockedReason(data.kind, row);
    const start = currentStartMs(data.kind, row);
    const within24h = start != null ? editNeedsApproval({ oldStartMs: start, newStartMs: start }).needs : false;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await (supabaseAdmin as any)
      .from("order_edit_requests")
      .select("id, changes, created_at")
      .eq("kind", data.kind)
      .eq("target_id", data.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      kind: data.kind,
      id: data.id,
      status: String(row.status),
      editable: reason == null,
      blockedReason: reason,
      within24h,
      pending: pending ?? null,
      contactName: row.contact_name ?? null,
      booking:
        data.kind === "booking"
          ? {
              session_date: String(row.session_date),
              start_time: String(row.start_time).slice(0, 5),
              end_time: String(row.end_time).slice(0, 5),
              hasReservedItems: Array.isArray(row.reserved_items) && row.reserved_items.length > 0,
            }
          : null,
      order:
        data.kind === "order"
          ? {
              session_date: String(row.session_date ?? "").slice(0, 10),
              return_date: String(row.return_date ?? "").slice(0, 10),
              pickup_time: naiveHHMM(row.pickup_at),
              return_time: naiveHHMM(row.return_at),
            }
          : null,
    };
  });

const submitSchema = z.object({
  kind: kindSchema,
  id: z.string().uuid(),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  pickup_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  return_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  note: z.string().trim().max(500).optional(),
});

export const submitOrderEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ status: "applied" | "pending_approval"; within24h?: boolean }> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const row = await loadOwnRow(supabase, data.kind, data.id, userId);

    const { assertNotBlocked } = await import("@/lib/customer-block.server");
    await assertNotBlocked({ userId, phone: row.contact_phone });

    const reason = blockedReason(data.kind, row);
    if (reason) throw new Error(reason);

    const changes = diffChanges(data.kind, row, data);
    if (Object.keys(changes).length === 0) throw new Error("לא בוצע שינוי בפרטי ההזמנה");

    // Validate first, so a request that could never be approved is not filed (and the customer hears why now).
    let newStartMs = currentStartMs(data.kind, row) as number;
    if (data.kind === "booking") {
      const v = await validateBookingChanges(db, row, changes);
      newStartMs = sessionStartMs(v.newDate, v.newStart);
    } else {
      const v = await validateOrderChanges(row, changes);
      const pd = String(row.session_date ?? row.pickup_at ?? "").slice(0, 10);
      if (v.pickup && pd) newStartMs = sessionStartMs(pd, v.pickup);
    }

    const policy = editNeedsApproval({ oldStartMs: currentStartMs(data.kind, row) as number, newStartMs });
    const original = {
      contact_name: row.contact_name ?? null,
      contact_phone: row.contact_phone ?? null,
      contact_email: row.contact_email ?? null,
      session_date: row.session_date ?? null,
      start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
      end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
      return_date: row.return_date ?? null,
      pickup_time: naiveHHMM(row.pickup_at),
      return_time: naiveHHMM(row.return_at),
      status: row.status,
    };

    // Studio bookings need admin approval within 24h; props orders apply at once (the page + the mail warn to call).
    if (policy.needs && data.kind === "booking") {
      const { data: dup } = await db
        .from("order_edit_requests")
        .select("id")
        .eq("kind", data.kind)
        .eq("target_id", data.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (dup) throw new Error("כבר יש בקשת עריכה שממתינה לאישור מנהל לגבי ההזמנה הזו. נעדכן אותך ברגע שתטופל.");

      const { data: req, error } = await db
        .from("order_edit_requests")
        .insert({ kind: data.kind, target_id: data.id, user_id: userId, changes, original, reason: policy.reason, status: "pending" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await notifyAdminOfRequest(db, req.id, data.kind, data.id, changes, original, policy.reason);
      return { status: "pending_approval" };
    }

    await applyEdit(data.kind, data.id, changes, "עריכת לקוחה");
    await db.from("order_edit_requests").insert({
      kind: data.kind,
      target_id: data.id,
      user_id: userId,
      changes,
      original,
      reason: null,
      status: "approved",
      auto_applied: true,
      decided_at: new Date().toISOString(),
    });
    return { status: "applied", within24h: policy.needs };
  });

/* ------------------------------------------------------------------ */
/* Admin: notification + review                                                                   */
/* ------------------------------------------------------------------ */

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function changeLines(kind: EditKind, changes: Record<string, string>, original: Record<string, any>): string[] {
  const lines: string[] = [];
  if (changes.session_date) lines.push(`${CHANGE_LABELS.session_date}: ${original.session_date ?? "—"} ← ${changes.session_date}`);
  if (changes.start_time) lines.push(`${CHANGE_LABELS.start_time}: ${original.start_time ?? "—"} ← ${changes.start_time}`);
  if (changes.pickup_time) lines.push(`${CHANGE_LABELS.pickup_time}: ${original.pickup_time ?? "—"} ← ${changes.pickup_time}`);
  if (changes.return_time) lines.push(`${CHANGE_LABELS.return_time}: ${original.return_time ?? "—"} ← ${changes.return_time}`);
  if (changes.note) lines.push(`${CHANGE_LABELS.note}: ${changes.note}`);
  return lines;
}

async function notifyAdminOfRequest(db: any, requestId: string, kind: EditKind, targetId: string, changes: any, original: any, reason: string | null) {
  const lines = changeLines(kind, changes, original);
  const what = kind === "booking" ? "שריון סטודיו" : "הזמנת אביזרים";
  try {
    await db.from("admin_notifications").insert({
      type: "order_edit_request",
      title: `בקשת עריכה לאישורך · ${what} · ${original.contact_name ?? ""}`.trim(),
      body: { request_id: requestId, kind, target_id: targetId, changes, original, reason, phone: original.contact_phone ?? null },
    });
  } catch (e) {
    console.error("[SWEETBABY] admin_notifications write for order edit request failed", e);
  }
  try {
    const { buildStudioMailHtml } = await import("@/lib/email-draft-design");
    const { pillButton } = await import("@/lib/orderSummary");
    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
    const html = buildStudioMailHtml({
      title: "בקשת עריכת הזמנה — ממתינה לאישורך",
      innerHtml: `
        <p>${esc(original.contact_name ?? "לקוחה")} ביקשה לערוך ${what} #${esc(targetId.slice(0, 8))}.</p>
        <p style="color:#b91c1c;font-weight:700">${esc(reason ?? "")} — לכן העריכה דורשת אישור מנהל. עד שתאשרי, ההזמנה נשארת כפי שהיא.</p>
        <ul style="line-height:1.9">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        <p>טלפון: <bdi dir="ltr">${esc(original.contact_phone ?? "")}</bdi></p>
        <div style="text-align:center;margin:20px 0">${pillButton(`${SITE}/admin/orders`, "לאישור או דחייה בניהול", true)}</div>`,
    });
    // Studio inbox only (no customer address), same pattern as the other owner notices.
    await sendStudioAndCustomer({ customerEmail: undefined, subject: `בקשת עריכת הזמנה לאישורך — ${original.contact_name ?? ""} · #${targetId.slice(0, 8)}`, html });
  } catch (e) {
    console.error("[SWEETBABY] order edit request mail to admin failed", e);
  }
}

export const listOrderEditRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("order_edit_requests")
      .select("id, kind, target_id, changes, original, reason, status, auto_applied, admin_note, created_at, decided_at")
      .eq("auto_applied", false)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ ...r, lines: changeLines(r.kind, r.changes ?? {}, r.original ?? {}) })) as Array<{
      id: string;
      kind: EditKind;
      target_id: string;
      changes: Record<string, string>;
      original: Record<string, any>;
      reason: string | null;
      status: "pending" | "approved" | "rejected";
      admin_note: string | null;
      created_at: string;
      decided_at: string | null;
      lines: string[];
    }>;
  });

export const reviewOrderEditRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean(), admin_note: z.string().trim().max(300).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const { data: req, error } = await db.from("order_edit_requests").select("*").eq("id", data.id).maybeSingle();
    if (error || !req) throw new Error("הבקשה לא נמצאה");
    if (req.status !== "pending") throw new Error("הבקשה כבר טופלה");

    if (data.approve) {
      // Throws (e.g. the slot was taken meanwhile) -> the request stays pending and the admin sees why.
      await applyEdit(req.kind, req.target_id, req.changes, "עריכת לקוחה (אושרה)");
    }
    const { error: upErr } = await db
      .from("order_edit_requests")
      .update({ status: data.approve ? "approved" : "rejected", admin_note: data.admin_note ?? null, decided_at: new Date().toISOString() })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    // Rejection: tell the customer (an approval already sent her the full updated summary).
    if (!data.approve) {
      try {
        const row = await loadRow(db, req.kind, req.target_id);
        const emails = await customerEmailsOf(db, req.kind, row);
        const { buildStudioMailHtml } = await import("@/lib/email-draft-design");
        const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
        const html = buildStudioMailHtml({
          title: "בקשת העריכה לא אושרה",
          innerHtml: `
            <p>שלום ${esc(req.original?.contact_name ?? "")},</p>
            <p>לצערנו לא הצלחנו לאשר את בקשת העריכה שלך להזמנה #${esc(String(req.target_id).slice(0, 8))}. ההזמנה נשארת כפי שהייתה.</p>
            ${data.admin_note ? `<p>${esc(data.admin_note)}</p>` : ""}
            <p>לשאלות: s0548529277@gmail.com / 054-8529277</p>`,
        });
        await sendStudioAndCustomer({ customerEmail: emails, subject: `בקשת העריכה להזמנה #${String(req.target_id).slice(0, 8)} לא אושרה · Sweetbaby`, html });
      } catch (e) {
        console.error("[SWEETBABY] order edit rejection mail failed", e);
      }
    }
    return { ok: true };
  });
