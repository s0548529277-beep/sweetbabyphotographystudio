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
  "id, user_id, status, deposit_status, deposit_amount, session_date, return_date, pickup_at, return_at, total, notes, balance_method, contact_name, contact_phone, contact_email, camera_model, google_event_id, door_code, ttlock_lock_id, ttlock_keyboard_pwd_id";

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

type OrderLine = { id: string; item_id: string | null; item_name: string; item_sku: string | null; quantity: number; price: number };
type OrderPlan = {
  pickup: string | null;
  ret: string | null;
  pickupDate: string;
  returnDate: string;
  datesChanged: boolean;
  moved: boolean;
  removed: OrderLine[];
  kept: OrderLine[];
  oldMult: number;
  newMult: number;
  /** New unit price per kept line id (only when the rental-day multiplier changed). */
  newPrices: Map<string, number>;
  /** Change of the order price in ₪ (negative = cheaper). */
  delta: number;
};

const israelToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

async function validateOrderChanges(db: any, row: any, changes: OrderChanges): Promise<OrderPlan> {
  const { isWithinPropsHandoffHours, PROPS_HANDOFF_NOTE } = await import("@/lib/props-hours");
  const { computeDayMultiplier } = await import("@/lib/orders.functions");
  const oldPickup = naiveHHMM(row.pickup_at);
  const oldReturn = naiveHHMM(row.return_at);
  const oldPickupDate = String(row.session_date ?? row.pickup_at ?? "").slice(0, 10);
  const oldReturnDate = String(row.return_date ?? row.return_at ?? "").slice(0, 10);
  const pickup = changes.pickup_time ?? oldPickup;
  const ret = changes.return_time ?? oldReturn;
  const pickupDate = changes.pickup_date ?? oldPickupDate;
  const returnDate = changes.return_date ?? oldReturnDate;
  const datesChanged = pickupDate !== oldPickupDate || returnDate !== oldReturnDate;
  const timesChanged = pickup !== oldPickup || ret !== oldReturn;
  const removeSkus = changes.remove_skus ? changes.remove_skus.split(",").filter(Boolean) : [];

  if (timesChanged || datesChanged) {
    if (changes.pickup_time && !isWithinPropsHandoffHours(changes.pickup_time)) throw new Error(PROPS_HANDOFF_NOTE);
    if (changes.return_time && !isWithinPropsHandoffHours(changes.return_time)) throw new Error(PROPS_HANDOFF_NOTE);
    if (pickupDate && returnDate && returnDate < pickupDate) throw new Error("תאריך ההחזרה חייב להיות אחרי תאריך האיסוף");
    if (pickupDate && returnDate && pickupDate === returnDate && pickup && ret && ret <= pickup) {
      throw new Error("שעת ההחזרה חייבת להיות אחרי שעת האיסוף");
    }
    if (datesChanged && pickupDate < israelToday()) throw new Error("תאריך האיסוף כבר עבר");
  }

  const oldMult = computeDayMultiplier(`${oldPickupDate}T${oldPickup ?? "09:00"}:00`, `${oldReturnDate}T${oldReturn ?? "18:00"}:00`);
  const newMult = computeDayMultiplier(`${pickupDate}T${pickup ?? "09:00"}:00`, `${returnDate}T${ret ?? "18:00"}:00`);

  const { data: lineRows, error: lerr } = await db
    .from("order_items")
    .select("id, item_id, item_name, item_sku, quantity, price")
    .eq("order_id", row.id);
  if (lerr) throw new Error(lerr.message);
  const lines: OrderLine[] = (lineRows ?? []).map((l: any) => ({ ...l, quantity: Number(l.quantity), price: Number(l.price) }));

  for (const sku of removeSkus) {
    if (!lines.some((l) => l.item_sku === sku)) throw new Error("אחד הפריטים להסרה לא נמצא בהזמנה");
  }
  const removed = lines.filter((l) => l.item_sku && removeSkus.includes(l.item_sku));
  const kept = lines.filter((l) => !removed.includes(l));
  if (removeSkus.length > 0 && kept.length === 0) {
    throw new Error("אי אפשר להסיר את כל הפריטים — לביטול ההזמנה נא לפנות לצוות הסטודיו.");
  }

  // Lines store unit price x rental-day multiplier; keep the base price and re-multiply when the days change.
  const newPrices = new Map<string, number>();
  let newRaw = 0;
  for (const l of kept) {
    const base = l.price / Math.max(1, oldMult);
    const unit = newMult !== oldMult ? Math.round(base * newMult) : l.price;
    if (unit !== l.price) newPrices.set(l.id, unit);
    newRaw += unit * l.quantity;
  }
  const oldRaw = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const delta = Math.round(newRaw - oldRaw);
  if (delta !== 0 && newRaw < 50) throw new Error("מינימום הזמנה 50 ש״ח");

  // Availability for the new dates: other orders' reservations (the order's own rows do not count against itself).
  if (datesChanged) {
    for (const l of kept) {
      if (!l.item_id) continue;
      const { data: it } = await db.from("items").select("stock_quantity, name").eq("id", l.item_id).maybeSingle();
      const stock = Number(it?.stock_quantity ?? 1);
      const { data: reserved, error: rerr } = await db.rpc("count_item_reservations", { _item_id: l.item_id, _from: pickupDate, _to: returnDate });
      if (rerr) throw new Error(rerr.message);
      const { count: own } = await db
        .from("item_availability")
        .select("id", { count: "exact", head: true })
        .eq("order_id", row.id)
        .eq("item_id", l.item_id)
        .lte("start_date", returnDate)
        .gte("end_date", pickupDate);
      const busy = Math.max(0, Number(reserved ?? 0) - Number(own ?? 0));
      if (busy + l.quantity > stock) throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים החדשים`);
    }
  }

  return { pickup, ret, pickupDate, returnDate, datesChanged, moved: timesChanged || datesChanged, removed, kept, oldMult, newMult, newPrices, delta };
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
    if (input.pickup_date && input.pickup_date !== String(row.session_date ?? "").slice(0, 10)) out.pickup_date = input.pickup_date;
    if (input.return_date && input.return_date !== String(row.return_date ?? "").slice(0, 10)) out.return_date = input.return_date;
    if (Array.isArray(input.remove_skus) && input.remove_skus.length) out.remove_skus = [...new Set<string>(input.remove_skus)].sort().join(",");
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
        ? "ההזמנה עודכנה לפי הבקשה שלך. למטה הפרטים המעודכנים — כדאי לעבור עליהם ולוודא שהכול נכון."
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
  const v = await validateOrderChanges(db, o, changes);
  const pickupDate = v.pickupDate;
  const returnDate = v.returnDate;
  const hasLineChange = v.removed.length > 0 || v.newPrices.size > 0;

  const update: Record<string, unknown> = {};
  if (v.moved) {
    if (v.datesChanged) {
      update.session_date = pickupDate;
      update.scheduled_date = pickupDate;
      update.return_date = returnDate;
    }
    if (v.pickup && pickupDate) update.pickup_at = `${pickupDate}T${v.pickup}:00`;
    if (v.ret && returnDate) update.return_at = `${returnDate}T${v.ret}:00`;
    update.reminder_sent_at = null;
    update.reminder_4h_sent_at = null;
  }
  let priceNote: string | null = null;
  if (v.delta !== 0) {
    const newTotal = Math.max(0, Number(o.total) + v.delta);
    update.total = newTotal;
    if (o.deposit_status === "pending") update.deposit_amount = newTotal;
    priceNote = `המחיר שונה ב-${v.delta > 0 ? "+" : ""}₪${v.delta} (סה״כ ₪${newTotal})${o.deposit_status === "pending" ? "" : " — התשלום כבר שולם: לבדוק תשלום/החזר"}`;
  }
  if (changes.note || priceNote || v.removed.length) {
    const parts = [
      changes.note,
      v.removed.length ? `הוסרו פריטים: ${v.removed.map((l) => l.item_name).join(", ")}` : null,
      priceNote,
    ].filter(Boolean).join(" · ");
    update.notes = appendNote(o.notes, parts, who);
  }
  if (Object.keys(update).length === 0 && !hasLineChange) return;

  // Availability + lines first (restored on failure), then the order row.
  if (v.datesChanged || v.removed.length) {
    const { data: oldRows } = await db.from("item_availability").select("*").eq("order_id", id);
    const restore = async () => {
      await db.from("item_availability").delete().eq("order_id", id);
      if (oldRows?.length) await db.from("item_availability").insert(oldRows);
    };
    try {
      await db.from("item_availability").delete().eq("order_id", id);
      for (const l of v.kept) {
        if (!l.item_id) continue;
        const { data: it } = await db.from("items").select("stock_quantity").eq("id", l.item_id).maybeSingle();
        const stock = Number(it?.stock_quantity ?? 1);
        const { data: reserved } = await db.rpc("count_item_reservations", { _item_id: l.item_id, _from: pickupDate, _to: returnDate });
        let slot = Number(reserved ?? 0);
        for (let i = 0; i < l.quantity; i++) {
          let placed = false;
          for (let attempt = slot; attempt < stock + 8 && !placed; attempt++) {
            const { error } = await db.from("item_availability").insert({
              item_id: l.item_id, order_id: id, date: pickupDate, start_date: pickupDate, end_date: returnDate, slot_index: attempt,
            });
            if (!error) { placed = true; slot = attempt + 1; }
            else if (!((error as any).code === "23505" || /duplicate|unique/i.test(error.message ?? ""))) throw new Error(error.message);
          }
          if (!placed) throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים החדשים`);
        }
      }
    } catch (e) {
      await restore();
      throw e;
    }
  }
  if (v.removed.length) {
    const { error: derr } = await db.from("order_items").delete().in("id", v.removed.map((l) => l.id));
    if (derr) throw new Error(derr.message);
  }
  for (const [lineId, unit] of v.newPrices) {
    await db.from("order_items").update({ price: unit }).eq("id", lineId);
  }

  if (Object.keys(update).length > 0) {
    const { error } = await db.from("orders").update(update).eq("id", id);
    if (error) throw new Error(error.message);
  }

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
      intro: v.moved || hasLineChange
        ? "ההזמנה עודכנה לפי הבקשה שלך. למטה הפרטים המעודכנים — כדאי לעבור עליהם ולוודא שהכול נכון. אם האיסוף בתוך 24 שעות, אנא התקשרי אלינו לוודא שהכול תקין: 054-8529277."
        : "ההערה שלך נוספה להזמנה. למטה סיכום ההזמנה.",
      order: {
        id: o.id,
        contact_name: o.contact_name,
        session_date: pickupDate,
        pickup_time: pick ? naiveHHMM(String(pick)) : null,
        return_date: returnDate,
        return_time: ret ? naiveHHMM(String(ret)) : null,
        total: (update.total as number | undefined) ?? o.total,
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
    let orderLinesForPage: Array<{ sku: string | null; name: string; quantity: number }> = [];
    if (data.kind === "order") {
      const { supabaseAdmin: adm } = await import("@/integrations/supabase/client.server");
      const { data: ls } = await (adm as any).from("order_items").select("item_sku, item_name, quantity").eq("order_id", data.id);
      orderLinesForPage = (ls ?? []).map((l: any) => ({ sku: l.item_sku ?? null, name: l.item_name, quantity: Number(l.quantity) }));
    }
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
              total: Number(row.total ?? 0),
              lines: orderLinesForPage,
            }
          : null,
    };
  });

/** Live preview for the edit page: price change / refusal reason for a props-order edit, nothing is saved. */
export const previewOrderEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string; delta?: number; newTotal?: number; needsApproval?: boolean }> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadOwnRow(supabase, "order", data.id, userId);
    try {
      const changes = diffChanges("order", row, data);
      if (!changes.pickup_date && !changes.return_date && !changes.pickup_time && !changes.return_time && !changes.remove_skus) return { ok: true, delta: 0 };
      const v = await validateOrderChanges(supabaseAdmin as any, row, changes);
      return { ok: true, delta: v.delta, newTotal: Math.max(0, Number(row.total) + v.delta), needsApproval: v.delta !== 0 };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "לא ניתן לבצע את השינוי" };
    }
  });

const submitSchema = z.object({
  kind: kindSchema,
  id: z.string().uuid(),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  pickup_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  return_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remove_skus: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
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
    let priceDelta = 0;
    let itemNames: Record<string, string> = {};
    if (data.kind === "booking") {
      const v = await validateBookingChanges(db, row, changes);
      newStartMs = sessionStartMs(v.newDate, v.newStart);
    } else {
      const v = await validateOrderChanges(db, row, changes);
      if (v.pickup && v.pickupDate) newStartMs = sessionStartMs(v.pickupDate, v.pickup);
      priceDelta = v.delta;
      if (v.delta !== 0) changes.price_delta = String(v.delta);
      itemNames = Object.fromEntries(v.removed.filter((l) => l.item_sku).map((l) => [l.item_sku as string, l.item_name]));
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
      item_names: itemNames,
    };

    // Studio bookings need admin approval within 24h. Props orders apply at once (the page + the mail warn to call) —
    // EXCEPT an edit that changes the price (other dates / removed items): money changes always go to the admin.
    const priceApproval = data.kind === "order" && priceDelta !== 0;
    if ((policy.needs && data.kind === "booking") || priceApproval) {
      const reason2 = policy.needs && data.kind === "booking" ? policy.reason : `השינוי משנה את המחיר (${priceDelta > 0 ? "+" : ""}₪${priceDelta})`;
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
        .insert({ kind: data.kind, target_id: data.id, user_id: userId, changes, original, reason: reason2, status: "pending" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await notifyAdminOfRequest(db, req.id, data.kind, data.id, changes, original, reason2);
      // Tell the customer her request arrived (nothing changes until the admin decides).
      try {
        const emails = await customerEmailsOf(db, data.kind, row);
        if (emails.length) {
          const { buildStudioMailHtml } = await import("@/lib/email-draft-design");
          const { sendGmail } = await import("@/integrations/google/gmail.server");
          const html = buildStudioMailHtml({
            title: "קיבלנו את בקשת העריכה שלך",
            innerHtml: `
              <p>שלום ${esc(row.contact_name ?? "")},</p>
              <p>בקשת העריכה להזמנה #${esc(String(data.id).slice(0, 8))} התקבלה והועברה לאישור. עד שתאושר ההזמנה נשארת כפי שהיא, ונעדכן אותך במייל ברגע שתטופל.</p>
              <p>${esc(reason2 ?? "")}</p>
              <p>לשאלות דחופות: <strong dir="ltr">054-8529277</strong></p>`,
          });
          for (const to of emails) {
            await sendGmail({ to, subject: `קיבלנו את בקשת העריכה להזמנה #${String(data.id).slice(0, 8)} · Sweetbaby`, html });
          }
        }
      } catch (e) {
        console.error("[SWEETBABY] edit request acknowledgement mail failed", e);
      }
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

/** Start times (30-min steps) that are free for this studio booking on a date, same length and package. */
export const getFreeBookingStarts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }): Promise<{ times: string[] }> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const row = await loadOwnRow(supabase, "booking", data.id, userId);
    const { isMorningPackage } = await import("@/lib/bookings.functions");
    const { bookingBlocksSlot } = await import("@/lib/availability.server");
    const hhmm = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + m; };
    const busy: Array<[number, number]> = [];
    const { data: existing } = await db
      .from("bookings")
      .select("id, start_time, end_time, status, deposit_status, created_at, notes")
      .eq("session_date", data.date)
      .neq("status", "cancelled")
      .neq("id", row.id);
    for (const b of (existing ?? []).filter((x: any) => bookingBlocksSlot(x))) busy.push([hhmm(b.start_time), hhmm(b.end_time)]);
    try {
      const { listGoogleCalendarBusy } = await import("@/integrations/google/calendar.server");
      const gbusy = await listGoogleCalendarBusy(data.date, data.date);
      const ownS = hhmm(row.start_time);
      const ownE = hhmm(row.end_time);
      for (const [bs, be] of gbusy[data.date] ?? []) {
        if (row.google_event_id && row.session_date === data.date && bs === ownS && be === ownE) continue;
        busy.push([bs, be]);
      }
    } catch (e) {
      console.error("[SWEETBABY] edit-order free starts: calendar read failed", e);
    }
    const oldStart = String(row.start_time).slice(0, 5);
    const times: string[] = [];
    for (let m = 7 * 60; m <= 21 * 60; m += 30) {
      const start = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const end = addMinutesHHMM(start, Number(row.slots) * 30);
      if (end <= start) continue;
      if (sessionStartMs(data.date, start) <= Date.now()) continue;
      if (isMorningPackage(Number(row.slots), start) !== isMorningPackage(Number(row.slots), oldStart)) continue;
      const e = hhmm(end);
      if (busy.some(([bs, be]) => m < be && e > bs)) continue;
      times.push(start);
    }
    return { times };
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
  if (changes.pickup_date) lines.push(`${CHANGE_LABELS.pickup_date}: ${original.session_date ?? "—"} ← ${changes.pickup_date}`);
  if (changes.return_date) lines.push(`${CHANGE_LABELS.return_date}: ${original.return_date ?? "—"} ← ${changes.return_date}`);
  if (changes.remove_skus) {
    const names = changes.remove_skus.split(",").map((k) => original.item_names?.[k] ?? k);
    lines.push(`${CHANGE_LABELS.remove_skus}: ${names.join(", ")}`);
  }
  if (changes.price_delta) lines.push(`${CHANGE_LABELS.price_delta}: ${Number(changes.price_delta) > 0 ? "+" : ""}₪${changes.price_delta}`);
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
