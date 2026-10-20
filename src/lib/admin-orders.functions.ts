import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeDayMultiplier } from "@/lib/orders.functions";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/** Count of orders still awaiting confirmation ("ממתין לאישור") — backs the orders bell shown next to the notifications bell on every admin page. */
export const countPendingOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { count, error } = await context.supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

/**
 * Admin-side status change for an order/booking (used by the dropdown on
 * /admin/orders). This replaces a previous direct client-side
 * `supabase.from(table).update({ status })` call, which flipped the status
 * column via RLS with none of the side effects that self-cancellation
 * already had: reserved props were never freed, the Google Calendar event
 * was never deleted, and loyalty credit applied at checkout was never
 * refunded. An admin cancelling an *active* order — something a customer
 * can't even do herself — silently skipped all of that.
 *
 * This function is now the single place that transition-into-"cancelled"
 * cleanup lives, so both the customer's self-cancel (cancelOrder/
 * cancelBooking in orders.functions.ts / bookings.functions.ts) and this
 * admin path stay consistent. If a third cancellation entry point is ever
 * added, it should call this instead of writing status directly too.
 */
export const adminSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["order", "booking"]),
        id: z.string().uuid(),
        status: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "order" ? "orders" : "bookings";

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from(table)
      // Both bookings AND props orders get a Google Calendar event once
      // payment is confirmed (see confirmBookingDeposit / confirmOrderDeposit),
      // so google_event_id is selected for both kinds, not just bookings.
      // subscription_pass_id only exists on bookings, not orders (props
      // rental never touches a studio-visit pass).
      .select(
        data.kind === "booking"
          ? "id, user_id, status, credit_used_cashback, credit_used_manual, cashback_awarded, google_event_id, subscription_pass_id, session_date"
          : "id, user_id, status, credit_used_cashback, credit_used_manual, cashback_awarded, google_event_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !row) throw new Error("הרשומה לא נמצאה");

    // The conditional `.select()` (bookings include subscription_pass_id,
    // orders do not) collapses to a ParserError union in the generated
    // PostgREST types, so cast to a fixed shape before touching fields.
    const r = row as unknown as {
      status: string;
      user_id: string;
      credit_used_cashback?: number | null;
      credit_used_manual?: number | null;
      cashback_awarded?: number | null;
      google_event_id?: string | null;
      subscription_pass_id?: string | null;
      session_date?: string | null;
    };

    const wasCancelled = r.status === "cancelled";
    const willBeCancelled = data.status === "cancelled";

    const { error: upErr } = await supabaseAdmin.from(table).update({ status: data.status }).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    // Only run cancellation cleanup on the transition INTO cancelled — not
    // on every save, and not again if it was already cancelled.
    if (willBeCancelled && !wasCancelled) {
      const idColumn = data.kind === "order" ? "order_id" : "booking_id";
      await supabaseAdmin.from("item_availability").delete().eq(idColumn, data.id);

      // Refund into whichever bucket the credit actually came from.
      const refundCashback = Number(r.credit_used_cashback ?? 0);
      const refundManual = Number(r.credit_used_manual ?? 0);
      try {
        if (refundCashback > 0) {
          await supabaseAdmin.rpc("adjust_loyalty_credit", { p_user_id: r.user_id, p_delta: refundCashback, p_source: "cashback" });
        }
        if (refundManual > 0) {
          await supabaseAdmin.rpc("adjust_loyalty_credit", { p_user_id: r.user_id, p_delta: refundManual, p_source: "manual" });
        }
      } catch (e) {
        console.error("[SWEETBABY] credit refund on admin cancel failed", e);
      }

      // Claw back cashback this order/booking itself earned (if any) —
      // otherwise a cancelled purchase still leaves its cashback behind.
      const { clawBackCashback } = await import("@/lib/loyalty");
      await clawBackCashback(supabaseAdmin, r.user_id, r.cashback_awarded ?? 0);

      const passId = r.subscription_pass_id;
      if (passId) {
        // Atomic (clamped at 0, single UPDATE) via the same RPC redemption
        // uses, not read-then-write.
        await supabaseAdmin.rpc("adjust_subscription_pass_entries", { p_pass_id: passId, p_delta: -1 });
      }

      const googleEventId = r.google_event_id;
      if (googleEventId) {
        try {
          const { deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
          await deleteGoogleCalendarEvent(googleEventId);
        } catch (e) {
          console.error("[SWEETBABY] gcal delete on admin cancel failed", e);
        }
      }

      if (data.kind === "booking" && r.session_date) {
        const { notifyWaitlistForFreedSlot } = await import("@/lib/waitlist.functions");
        await notifyWaitlistForFreedSlot(r.session_date);
      }
    }

    return { ok: true };
  });

/**
 * Partial cancellation for a single line of a props order — e.g. the
 * customer only wants to return/cancel 1 of the 3 lights she ordered,
 * instead of the whole order. Reduces (or, if the full quantity is
 * cancelled, removes) the order_items row, frees that many
 * item_availability slot locks for the same item on this order so the
 * freed units become bookable again, and recomputes the order's total
 * (and deposit_amount, which for props orders always equals total — see
 * placeOrder's "full payment up front, no deposit split" comment) down by
 * the cancelled amount. Does NOT touch credit/cashback/coupon bookkeeping —
 * those were calculated against the original full order and a partial
 * cancellation refund is a manual decision the admin makes outside this
 * flow; the returned refundAmount is just what the cancelled line itself
 * was worth, for her reference.
 */
export const adminPartialCancelOrderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_item_id: z.string().uuid(),
        cancel_quantity: z.number().int().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item, error: itemErr } = await supabaseAdmin
      .from("order_items")
      .select("id, order_id, item_id, item_name, quantity, price")
      .eq("id", data.order_item_id)
      .maybeSingle();
    if (itemErr || !item) throw new Error("פריט ההזמנה לא נמצא");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, total, notes")
      .eq("id", item.order_id)
      .maybeSingle();
    if (orderErr || !order) throw new Error("ההזמנה לא נמצאה");
    if (order.status === "cancelled") throw new Error("ההזמנה כבר בוטלה כולה");

    const cancelQty = Math.min(data.cancel_quantity, item.quantity);
    if (cancelQty <= 0) throw new Error("כמות לא תקינה");

    const refundAmount = Number(item.price) * cancelQty;
    const remainingQty = item.quantity - cancelQty;

    if (remainingQty > 0) {
      const { error } = await supabaseAdmin.from("order_items").update({ quantity: remainingQty }).eq("id", item.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("order_items").delete().eq("id", item.id);
      if (error) throw new Error(error.message);
    }

    // Free that many availability slot locks for this item on this order —
    // the rows are interchangeable (just item_id/order_id/slot_index), so any
    // cancelQty of them freed makes exactly that many units bookable again.
    const { data: slots } = await supabaseAdmin
      .from("item_availability")
      .select("id")
      .eq("order_id", item.order_id)
      .eq("item_id", item.item_id as string)
      .limit(cancelQty);
    const slotIds = (slots ?? []).map((s: { id: string }) => s.id);
    if (slotIds.length > 0) {
      await supabaseAdmin.from("item_availability").delete().in("id", slotIds);
    }

    const newTotal = Math.max(0, Number(order.total) - refundAmount);
    const noteLine = `ביטול חלקי: ${item.item_name} ×${cancelQty} · -₪${refundAmount} (${new Date().toLocaleDateString("he-IL")})`;
    const newNotes = [order.notes, noteLine].filter(Boolean).join("\n");
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ total: newTotal, deposit_amount: newTotal, notes: newNotes })
      .eq("id", item.order_id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, refundAmount, newTotal };
  });

/**
 * Admin-only edit of a studio booking's start/end time (e.g. the customer
 * asked to shift a confirmed session an hour later, same day). Deliberately
 * does NOT recompute price — the booking's price was already fixed at
 * creation against that session's package/guidance/coupon/pass choices, and
 * a pure time shift shouldn't silently change what she's being charged; the
 * admin can edit the price separately if the new time actually changes the
 * package. Re-runs the same overlap check placeBooking itself uses (against
 * other non-cancelled bookings on the same date) so an edit can't silently
 * create a double-booking, and best-effort re-syncs the Google Calendar
 * event (delete + recreate, since calendar.server.ts has no update helper)
 * if one already exists for this booking.
 */
export const adminUpdateBookingHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select("id, session_date, start_time, end_time, status, contact_name, contact_phone, google_event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !booking) throw new Error("השריון לא נמצא");
    if (booking.status === "cancelled") throw new Error("השריון בוטל — אי אפשר לערוך שעות");

    const [sh, sm] = data.start_time.split(":").map(Number);
    const [eh, em] = data.end_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) throw new Error("שעת הסיום צריכה להיות אחרי שעת ההתחלה");

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("bookings")
      .select("id, start_time, end_time, status, deposit_status, created_at, notes")
      .eq("session_date", booking.session_date)
      .neq("status", "cancelled")
      .neq("id", data.id);
    if (exErr) throw new Error(exErr.message);
    const { bookingBlocksSlot } = await import("@/lib/availability.server");
    for (const b of (existing ?? []).filter((b: any) => bookingBlocksSlot(b))) {
      const [bh, bm] = String(b.start_time).split(":").map(Number);
      const [beh, bem] = String(b.end_time).split(":").map(Number);
      const bs = bh * 60 + bm;
      const be = beh * 60 + bem;
      if (startMin < be && endMin > bs) {
        throw new Error("השעה החדשה מתנגשת עם שריון אחר באותו יום");
      }
    }

    const { error: updErr } = await supabaseAdmin
      .from("bookings")
      .update({ start_time: data.start_time, end_time: data.end_time })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    if (booking.google_event_id) {
      try {
        const { deleteGoogleCalendarEvent, createGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
        await deleteGoogleCalendarEvent(booking.google_event_id);
        const event = await createGoogleCalendarEvent({
          summary: `סשן צילומים · ${booking.contact_name ?? ""}`,
          description: `טלפון: ${booking.contact_phone ?? ""}`,
          startISO: `${booking.session_date}T${data.start_time}:00`,
          endISO: `${booking.session_date}T${data.end_time}:00`,
          location: "תלמוד ירושלמי 24, בית שמש",
          attendees: [],
        });
        if (event) {
          await supabaseAdmin.from("bookings").update({ google_event_id: event.id }).eq("id", data.id);
        }
      } catch (e) {
        console.error("[SWEETBABY] calendar re-sync on admin hour edit failed", e);
      }
    }

    return { ok: true };
  });

// Shared by adminUpdateOrderDates/adminAddOrderItem below — the exact same
// "try slot_index from the current count upward, retry past a unique-
// conflict, give up once stock is exhausted" loop placeOrder itself uses
// (orders.functions.ts), just not exported from there since this is the
// only other place that needs to grab fresh slots one item at a time.
async function insertAvailabilitySlots(
  supabaseAdmin: any,
  orderId: string,
  itemId: string,
  itemName: string,
  startDate: string,
  endDate: string,
  quantity: number,
  stock: number,
  startFrom: number,
): Promise<void> {
  let next = startFrom;
  for (let i = 0; i < quantity; i++) {
    let placed = false;
    for (let attempt = next; attempt < stock + 8; attempt++) {
      const { error } = await supabaseAdmin.from("item_availability").insert({
        item_id: itemId,
        order_id: orderId,
        date: startDate,
        start_date: startDate,
        end_date: endDate,
        slot_index: attempt,
      });
      if (!error) {
        next = attempt + 1;
        placed = true;
        break;
      }
      const isConflict = (error as { code?: string }).code === "23505" || /duplicate|unique/i.test(error.message ?? "");
      if (!isConflict) throw new Error(error.message);
      if (attempt + 1 >= stock) break;
    }
    if (!placed) throw new Error(`הפריט "${itemName}" לא זמין בתאריכים שנבחרו`);
  }
}

/**
 * Admin-only edit of a props/equipment order's rental window — the date
 * range (and, same action, the pickup/return time-of-day baked into
 * pickup_at/return_at) — for when a customer asks to move her rental to a
 * different day or shift the pickup/return hour. Deliberately does NOT
 * recompute price (same philosophy as adminUpdateBookingHours above) —
 * each order_items.price already has that order's original day-multiplier
 * frozen into it at checkout time, and silently re-pricing on an admin
 * date tweak would risk charging/crediting the customer for something she
 * never saw or agreed to; if the new range genuinely needs a different
 * price, that's a manual decision via the existing partial-cancel /
 * contact-the-customer tools, not an automatic side effect here.
 *
 * Re-validates stock for every order_items line against the NEW range
 * (excluding this order's own current reservation, which this function
 * itself relocates) using the same count_item_reservations overlap check
 * placeOrder uses, and moves every item_availability row for this order
 * to the new dates — delete-then-reinsert, with a same-transaction-ish
 * rollback (reinsert at the OLD dates) if any item can't find a free slot
 * at the new ones, so a failed move never leaves the order's lock missing.
 * Best-effort re-syncs the Google Calendar event, same delete+recreate
 * pattern as every other calendar re-sync in this app (no update primitive
 * exists in calendar.server.ts).
 */
export const adminUpdateOrderDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        session_date: z.string().min(10).max(10),
        return_date: z.string().min(10).max(10),
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.return_date < data.session_date) throw new Error("תאריך ההחזרה צריך להיות אחרי תאריך האיסוף");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, session_date, return_date, notes, contact_name, contact_phone, camera_model, total, google_event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (orderErr || !order) throw new Error("ההזמנה לא נמצאה");
    if (order.status === "cancelled") throw new Error("ההזמנה בוטלה — אי אפשר לערוך תאריכים");

    const { data: lines, error: linesErr } = await supabaseAdmin
      .from("order_items")
      .select("item_id, item_name, quantity")
      .eq("order_id", data.id);
    if (linesErr) throw new Error(linesErr.message);
    if (!lines || lines.length === 0) throw new Error("אין פריטים בהזמנה הזו");
    if (lines.some((l: any) => !l.item_id)) {
      throw new Error("אחד הפריטים בהזמנה נמחק מהקטלוג — אי אפשר להעביר תאריכים אוטומטית, יש לפנות לתמיכה");
    }
    const typedLines = lines as { item_id: string; item_name: string | null; quantity: number }[];

    const itemIds = typedLines.map((l) => l.item_id);
    const { data: itemRows, error: itemsErr } = await supabaseAdmin
      .from("items")
      .select("id, stock_quantity")
      .in("id", itemIds);
    if (itemsErr) throw new Error(itemsErr.message);
    const stockById = new Map((itemRows ?? []).map((i: any) => [i.id, Number(i.stock_quantity ?? 1)]));

    const oldSession = order.session_date as string;
    const oldReturn = order.return_date as string;

    // Remember exactly which rows existed (so a rollback restores the real
    // count per item, not just a guess from order_items.quantity).
    const { data: oldSlots } = await supabaseAdmin
      .from("item_availability")
      .select("item_id")
      .eq("order_id", data.id);
    const oldCountByItem = new Map<string, number>();
    for (const s of oldSlots ?? []) oldCountByItem.set(s.item_id, (oldCountByItem.get(s.item_id) ?? 0) + 1);

    const { error: delErr } = await supabaseAdmin.from("item_availability").delete().eq("order_id", data.id);
    if (delErr) throw new Error(delErr.message);

    const rollback = async () => {
      for (const l of typedLines) {
        const count = oldCountByItem.get(l.item_id) ?? l.quantity;
        if (count > 0) {
          await insertAvailabilitySlots(
            supabaseAdmin, data.id, l.item_id, l.item_name ?? "", oldSession, oldReturn, count,
            (stockById.get(l.item_id) as number | undefined) ?? count, 0,
          );
        }
      }
    };

    try {
      for (const l of typedLines) {
        const stock = (stockById.get(l.item_id) as number | undefined) ?? l.quantity;
        const { data: taken, error: countErr } = await supabaseAdmin.rpc("count_item_reservations", {
          _item_id: l.item_id,
          _from: data.session_date,
          _to: data.return_date,
        });
        if (countErr) throw new Error(countErr.message);
        if ((taken ?? 0) + l.quantity > stock) {
          throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים החדשים`);
        }
        await insertAvailabilitySlots(
          supabaseAdmin, data.id, l.item_id, l.item_name ?? "", data.session_date, data.return_date, l.quantity, stock, taken ?? 0,
        );
      }
    } catch (e) {
      await supabaseAdmin.from("item_availability").delete().eq("order_id", data.id);
      await rollback();
      throw e instanceof Error ? e : new Error("המעבר לתאריכים החדשים נכשל");
    }

    const pickupAt = `${data.session_date}T${data.start_time}:00`;
    const returnAt = `${data.return_date}T${data.end_time}:00`;
    const dayMultiplier = computeDayMultiplier(pickupAt, returnAt);

    // Refresh the human-readable "שעות השכרה" line baked into notes at
    // checkout (see placeOrder) instead of leaving a stale date/time behind
    // it — same spirit as adminPartialCancelOrderItem appending its own
    // note line, just replacing this specific one rather than appending.
    const hoursLineRe = /^שעות השכרה:.*$/m;
    const newHoursLine = `שעות השכרה: ${data.start_time}–${data.end_time} · ${dayMultiplier} יח׳ של 24ש (מכפיל x${dayMultiplier})`;
    const newNotes = hoursLineRe.test(order.notes ?? "")
      ? (order.notes as string).replace(hoursLineRe, newHoursLine)
      : [order.notes, newHoursLine].filter(Boolean).join("\n");

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        session_date: data.session_date,
        scheduled_date: data.session_date,
        return_date: data.return_date,
        pickup_at: pickupAt,
        return_at: returnAt,
        notes: newNotes,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    if (order.google_event_id) {
      try {
        const { deleteGoogleCalendarEvent, createGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
        await deleteGoogleCalendarEvent(order.google_event_id);
        const { data: itemRows2 } = await supabaseAdmin.from("order_items").select("item_name, item_sku, quantity").eq("order_id", data.id);
        const event = await createGoogleCalendarEvent({
          summary: `איסוף אביזרים · ${order.contact_name ?? ""}`,
          description: [
            `טלפון: ${order.contact_phone ?? ""}`,
            `איסוף: ${data.session_date} ${data.start_time} · החזרה: ${data.return_date} ${data.end_time}`,
            `סה״כ: ₪${order.total}`,
            order.camera_model ? `מצלמה: ${order.camera_model}` : null,
            (itemRows2 ?? []).length
              ? `אביזרים: ${(itemRows2 ?? []).map((l: any) => `${l.item_sku} ${l.item_name} ×${l.quantity}`).join(", ")}`
              : null,
          ].filter(Boolean).join("\n"),
          startISO: pickupAt,
          endISO: returnAt,
          location: "תלמוד ירושלמי 24, בית שמש",
          attendees: [],
          transparent: true,
        });
        if (event) await supabaseAdmin.from("orders").update({ google_event_id: event.id }).eq("id", data.id);
      } catch (e) {
        console.error("[SWEETBABY] props order calendar re-sync on date edit failed", e);
      }
    }

    return { ok: true };
  });

/**
 * Admin-only "add an item" to an existing, still-open props/equipment
 * order — the counterpart to the existing adminPartialCancelOrderItem
 * (which only ever reduces/removes a line). Prices the new line at the
 * SAME day-multiplier this order's other lines already carry (derived
 * fresh from the order's own pickup_at/return_at via computeDayMultiplier,
 * orders.functions.ts — the exported helper placeOrder itself uses), so a
 * line added mid-rental is priced consistently with the rest of the order
 * rather than needing a second manual adjustment. Stock-checks the new
 * line against the order's existing date range exactly like placeOrder
 * does for a brand-new order.
 */
export const adminAddOrderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        sku: z.string().min(1),
        quantity: z.number().int().positive().max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, session_date, return_date, pickup_at, return_at, total, deposit_amount")
      .eq("id", data.order_id)
      .maybeSingle();
    if (orderErr || !order) throw new Error("ההזמנה לא נמצאה");
    if (order.status === "cancelled") throw new Error("ההזמנה בוטלה — אי אפשר להוסיף אביזרים");

    const { data: item, error: itemErr } = await supabaseAdmin
      .from("items")
      .select("id, name, sku, price, active, stock_quantity")
      .eq("sku", data.sku.trim())
      .maybeSingle();
    if (itemErr || !item || !item.active) throw new Error("פריט לא נמצא או לא פעיל — ודאי שה-SKU נכון");

    const stock = Number(item.stock_quantity ?? 1);
    const { data: taken, error: countErr } = await supabaseAdmin.rpc("count_item_reservations", {
      _item_id: item.id,
      _from: order.session_date as string,
      _to: order.return_date as string,
    });
    if (countErr) throw new Error(countErr.message);
    if ((taken ?? 0) + data.quantity > stock) throw new Error(`הפריט "${item.name}" לא זמין בתאריכי ההזמנה`);

    const pickupAt = order.pickup_at ?? `${order.session_date}T09:00:00`;
    const returnAt = order.return_at ?? `${order.return_date}T18:00:00`;
    const dayMultiplier = computeDayMultiplier(pickupAt, returnAt);
    const price = Number(item.price) * dayMultiplier;

    const { data: created, error: insErr } = await supabaseAdmin
      .from("order_items")
      .insert({
        order_id: data.order_id,
        item_id: item.id,
        item_name: item.name,
        item_sku: item.sku,
        quantity: data.quantity,
        price,
      })
      .select("id")
      .single();
    if (insErr || !created) throw new Error(insErr?.message ?? "הוספת הפריט נכשלה");

    try {
      await insertAvailabilitySlots(
        supabaseAdmin, data.order_id, item.id, item.name, order.session_date as string, order.return_date as string,
        data.quantity, stock, taken ?? 0,
      );
    } catch (e) {
      await supabaseAdmin.from("order_items").delete().eq("id", created.id);
      throw e;
    }

    const addedTotal = price * data.quantity;
    const newTotal = Number(order.total) + addedTotal;
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ total: newTotal, deposit_amount: newTotal })
      .eq("id", data.order_id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, addedTotal, newTotal };
  });

// Prefix on the "linked photo workflow" error, so the client can tell it
// apart from any other failure and offer the force-delete confirmation
// instead of just showing it as a dead-end error toast.
export const PHOTO_WORKFLOW_LINKED_PREFIX = "PHOTO_WORKFLOW_LINKED:";

/**
 * Permanently removes a cancelled order/booking row from /admin/orders —
 * the trash icon that only appears once a row is already "בוטל", so this
 * never touches anything still active. Restricted to status='cancelled'
 * both here and in the UI: adminSetStatus already ran the real
 * cancellation cleanup (freed props, refunded credit, deleted the
 * calendar event) when the row *became* cancelled, so this is just
 * clearing clutter from the list, not undoing a booking.
 *
 * bookings(id) cascades to photo_client_workflows.booking_id — a
 * photography booking that already has proof/edited photos uploaded for
 * a client would take the whole workflow (and every photo in it) down
 * with it. First call (force omitted) refuses and reports that a
 * workflow is linked, so the UI can ask the admin to confirm explicitly;
 * only with force=true does this actually delete the workflow's images
 * (storage objects included, not just the DB rows) and the workflow
 * itself before deleting the booking — a real decision, not a silent
 * cascade.
 */
export const adminDeleteRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["order", "booking"]), id: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "order" ? "orders" : "bookings";

    const { data: row, error: fetchErr } = await supabaseAdmin.from(table).select("id, status").eq("id", data.id).maybeSingle();
    if (fetchErr || !row) throw new Error("הרשומה לא נמצאה");
    if (row.status !== "cancelled") throw new Error("אפשר למחוק רק הזמנות שבוטלו");

    if (data.kind === "booking") {
      const { data: workflow } = await supabaseAdmin
        .from("photo_client_workflows")
        .select("id")
        .eq("booking_id", data.id)
        .maybeSingle();
      if (workflow) {
        if (!data.force) {
          throw new Error(`${PHOTO_WORKFLOW_LINKED_PREFIX}יש תהליך תמונות (גלריה) מקושר לשריון הזה — מחיקת ההזמנה תמחק גם את כל התמונות שלו.`);
        }
        const { data: images } = await supabaseAdmin.from("photo_client_images").select("storage_path").eq("workflow_id", workflow.id);
        const paths = (images ?? []).map((i: any) => i.storage_path).filter(Boolean);
        if (paths.length) await supabaseAdmin.storage.from("items").remove(paths);
        const { error: wfDelErr } = await supabaseAdmin.from("photo_client_workflows").delete().eq("id", workflow.id);
        if (wfDelErr) throw new Error(wfDelErr.message);
      }
    }

    const { error: delErr } = await supabaseAdmin.from(table).delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });
