import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
