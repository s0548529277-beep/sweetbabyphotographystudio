import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

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
          ? "id, user_id, status, credit_used_cashback, credit_used_manual, google_event_id, subscription_pass_id"
          : "id, user_id, status, credit_used_cashback, credit_used_manual, google_event_id",
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
      google_event_id?: string | null;
      subscription_pass_id?: string | null;
    };

    const wasCancelled = r.status === "cancelled";
    const willBeCancelled = data.status === "cancelled";

    const { error: upErr } = await supabaseAdmin
      .from(table)
      .update({ status: data.status })
      .eq("id", data.id);
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
          await supabaseAdmin.rpc("adjust_loyalty_credit", {
            p_user_id: r.user_id,
            p_delta: refundCashback,
            p_source: "cashback",
          });
        }
        if (refundManual > 0) {
          await supabaseAdmin.rpc("adjust_loyalty_credit", {
            p_user_id: r.user_id,
            p_delta: refundManual,
            p_source: "manual",
          });
        }
      } catch (e) {
        console.error("[SWEETBABY] credit refund on admin cancel failed", e);
      }

      const passId = r.subscription_pass_id;
      if (passId) {
        const { data: p } = await supabaseAdmin
          .from("subscription_passes")
          .select("entries_used")
          .eq("id", passId)
          .maybeSingle();
        if (p) {
          await supabaseAdmin
            .from("subscription_passes")
            .update({ entries_used: Math.max(0, Number(p.entries_used) - 1) })
            .eq("id", passId);
        }
      }

      const googleEventId = r.google_event_id;
      if (googleEventId) {
        try {
          const { deleteGoogleCalendarEvent } =
            await import("@/integrations/google/calendar.server");
          await deleteGoogleCalendarEvent(googleEventId);
        } catch (e) {
          console.error("[SWEETBABY] gcal delete on admin cancel failed", e);
        }
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
    z
      .object({
        kind: z.enum(["order", "booking"]),
        id: z.string().uuid(),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "order" ? "orders" : "bookings";

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from(table)
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
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
          throw new Error(
            `${PHOTO_WORKFLOW_LINKED_PREFIX}יש תהליך תמונות (גלריה) מקושר לשריון הזה — מחיקת ההזמנה תמחק גם את כל התמונות שלו.`,
          );
        }
        const { data: images } = await supabaseAdmin
          .from("photo_client_images")
          .select("storage_path")
          .eq("workflow_id", workflow.id);
        const paths = (images ?? []).map((i: any) => i.storage_path).filter(Boolean);
        if (paths.length) await supabaseAdmin.storage.from("items").remove(paths);
        const { error: wfDelErr } = await supabaseAdmin
          .from("photo_client_workflows")
          .delete()
          .eq("id", workflow.id);
        if (wfDelErr) throw new Error(wfDelErr.message);
      }
    }

    const { error: delErr } = await supabaseAdmin.from(table).delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });

/**
 * Admin-side edit of the basic contact/scheduling fields on an order or
 * booking — the "עריכת הזמנה" action on /admin/orders. Only the fields the
 * caller actually passes are touched, so a partial edit never clobbers
 * unrelated columns.
 */
export const adminUpdateOrderDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["order", "booking"]),
        id: z.string().uuid(),
        contact_name: z.string().min(1).max(160).optional(),
        contact_phone: z.string().min(1).max(40).optional(),
        session_date: z.string().min(1).optional(),
        return_date: z.string().min(1).optional(), // orders only
        start_time: z.string().min(1).optional(), // bookings only
        end_time: z.string().min(1).optional(), // bookings only
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "order" ? "orders" : "bookings";

    const patch: Record<string, unknown> = {};
    if (data.contact_name !== undefined) patch.contact_name = data.contact_name;
    if (data.contact_phone !== undefined) patch.contact_phone = data.contact_phone;
    if (data.session_date !== undefined) patch.session_date = data.session_date;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.kind === "order" && data.return_date !== undefined)
      patch.return_date = data.return_date;
    if (data.kind === "booking" && data.start_time !== undefined)
      patch.start_time = data.start_time;
    if (data.kind === "booking" && data.end_time !== undefined) patch.end_time = data.end_time;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await (supabaseAdmin.from(table) as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Admin-side edit of an order's line items (quantity/price per line, and
 * removing lines entirely) — props orders only, since studio bookings don't
 * have a comparable itemized list. `orders.total` is recomputed from the
 * remaining lines after every edit, minus whatever coupon_discount already
 * applied to the order (so re-editing items doesn't silently undo an
 * earlier coupon).
 */
export const adminUpdateOrderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        lines: z.array(
          z.object({
            id: z.string().uuid(),
            quantity: z.number().int().min(1).max(50),
            price: z.number().min(0),
          }),
        ),
        removedIds: z.array(z.string().uuid()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.removedIds.length > 0) {
      const { error } = await supabaseAdmin.from("order_items").delete().in("id", data.removedIds);
      if (error) throw new Error(error.message);
    }
    for (const line of data.lines) {
      const { error } = await supabaseAdmin
        .from("order_items")
        .update({ quantity: line.quantity, price: line.price })
        .eq("id", line.id);
      if (error) throw new Error(error.message);
    }

    const { data: remaining, error: fetchErr } = await supabaseAdmin
      .from("order_items")
      .select("price, quantity")
      .eq("order_id", data.orderId);
    if (fetchErr) throw new Error(fetchErr.message);
    const { data: orderRow } = await supabaseAdmin
      .from("orders")
      .select("coupon_discount")
      .eq("id", data.orderId)
      .maybeSingle();
    const base = (remaining ?? []).reduce(
      (s: number, l: any) => s + Number(l.price) * Number(l.quantity),
      0,
    );
    const total = Math.max(0, Math.round(base - Number(orderRow?.coupon_discount ?? 0)));

    const { error: upErr } = await supabaseAdmin
      .from("orders")
      .update({ total })
      .eq("id", data.orderId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, total };
  });

/**
 * Direct manual override of an order/booking's total price — for cases
 * a coupon code doesn't fit (a one-off discount, a manually-agreed price).
 * Deliberately separate from adminApplyCoupon below: this just sets the
 * number, no coupon bookkeeping (code/discount/redemption) involved.
 */
export const adminSetPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["order", "booking"]),
        id: z.string().uuid(),
        amount: z.number().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "order" ? "orders" : "bookings";
    const column = data.kind === "order" ? "total" : "price";
    const { error } = await (supabaseAdmin.from(table) as any)
      .update({ [column]: Math.round(data.amount) })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Retroactively applies a coupon code to an already-placed order/booking —
 * same `coupons` table and discount formula (percent + flat amount, capped
 * at the current price) as the checkout-time coupon in orders.functions.ts /
 * bookings.functions.ts, just run against the row's CURRENT total instead
 * of a fresh checkout total. coupon_discount accumulates (rather than being
 * overwritten) so a second coupon applied later doesn't erase the record of
 * an earlier one; a single-use coupon is marked redeemed here exactly like
 * at checkout.
 */
export const adminApplyCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["order", "booking"]),
        id: z.string().uuid(),
        code: z.string().min(1).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "order" ? "orders" : "bookings";
    const priceColumn = data.kind === "order" ? "total" : "price";

    const code = data.code.trim().toUpperCase();
    const { data: c } = await supabaseAdmin
      .from("coupons")
      .select(
        "id, code, discount_percent, discount_amount, active, expires_at, single_use, redeemed_at",
      )
      .eq("code", code)
      .maybeSingle();
    const valid =
      c &&
      c.active &&
      (!c.expires_at || new Date(c.expires_at) > new Date()) &&
      (!c.single_use || !c.redeemed_at);
    if (!valid) throw new Error("קוד הקופון אינו תקף");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from(table)
      .select(`${priceColumn}, coupon_discount`)
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !row) throw new Error("הרשומה לא נמצאה");
    const current = Number((row as any)[priceColumn] ?? 0);
    const off = Math.min(
      current,
      Math.round(
        (current * (Number(c!.discount_percent) || 0)) / 100 + (Number(c!.discount_amount) || 0),
      ),
    );
    const newTotal = Math.max(0, current - off);
    const prevDiscount = Number((row as any).coupon_discount ?? 0);

    const { error: upErr } = await (supabaseAdmin.from(table) as any)
      .update({
        [priceColumn]: newTotal,
        coupon_code: c!.code,
        coupon_discount: prevDiscount + off,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    if (c!.single_use) {
      await supabaseAdmin
        .from("coupons")
        .update({ redeemed_at: new Date().toISOString() })
        .eq("id", c!.id);
    }

    return { ok: true, total: newTotal, discount: off };
  });

/**
 * Sends (or resends) a payment-request email for an existing order/booking
 * — the "שליחת בקשת תשלום" button. Reuses the same HTML builders as the
 * original checkout-flow emails (orderSummary.ts) with an embedded
 * "pay now" button showing the row's current total/price, so this doubles
 * as a payment reminder after a manual price/coupon edit above. The
 * customer's email isn't stored on orders/bookings themselves (only
 * collected transiently at checkout time) — resolved here via the admin
 * auth API from user_id, same pattern as the booking-reminder cron in
 * bookings.functions.ts.
 */
export const adminSendPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["order", "booking"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");

    if (data.kind === "order") {
      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .select(
          "id, user_id, contact_name, session_date, return_date, total, notes, balance_method",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (error || !order) throw new Error("ההזמנה לא נמצאה");

      const { data: itemRows } = await supabaseAdmin
        .from("order_items")
        .select("item_name, item_sku, quantity, price")
        .eq("order_id", data.id);

      const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
      const customerEmail = authRes?.user?.email ?? undefined;
      if (!customerEmail) throw new Error("לא נמצאה כתובת מייל ללקוח/ה הזו");

      const { buildPropsOrderSummaryHtml } = await import("@/lib/orderSummary");
      const html = buildPropsOrderSummaryHtml({
        heading: "בקשת תשלום 💳",
        intro:
          "שלום! זו תזכורת להשלמת התשלום עבור הזמנת האביזרים שהזמנת מסטודיו Sweetbaby. אפשר לשלם ישירות דרך הכפתור למטה, או לתאם טלפונית.",
        order: {
          id: order.id,
          contact_name: order.contact_name,
          session_date: order.session_date ?? "",
          return_date: order.return_date ?? order.session_date ?? "",
          total: Number(order.total),
          notes: order.notes,
          balance_method: order.balance_method,
          lines: (itemRows ?? []).map((l: any) => ({
            item_name: l.item_name,
            item_sku: l.item_sku ?? "",
            quantity: l.quantity,
            price: Number(l.price) * Number(l.quantity),
          })),
        },
        paymentAmount: Number(order.total),
      });
      await sendStudioAndCustomer({
        customerEmail,
        subject: `בקשת תשלום — הזמנה #${order.id.slice(0, 8)} · Sweetbaby`,
        html,
      });
      return { ok: true };
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, user_id, contact_name, session_date, start_time, end_time, price, deposit_amount, balance_amount, notes, reserved_items",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error || !booking) throw new Error("השריון לא נמצא");

    const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(booking.user_id);
    const customerEmail = authRes?.user?.email ?? undefined;
    if (!customerEmail) throw new Error("לא נמצאה כתובת מייל ללקוח/ה הזו");

    const { buildBookingSummaryHtml } = await import("@/lib/orderSummary");
    const balance = Number(
      booking.balance_amount ??
        Math.max(0, Number(booking.price) - Number(booking.deposit_amount ?? 0)),
    );
    const html = buildBookingSummaryHtml({
      heading: "בקשת תשלום 💳",
      intro:
        "שלום! זו תזכורת להשלמת התשלום עבור השריון שקבעת בסטודיו Sweetbaby. אפשר לשלם ישירות דרך הכפתור למטה, או לתאם טלפונית.",
      booking: {
        id: booking.id,
        contact_name: booking.contact_name,
        session_date: booking.session_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        price: Number(booking.price),
        deposit_amount: booking.deposit_amount,
        balance_amount: booking.balance_amount,
        notes: booking.notes,
        reserved_items: (Array.isArray(booking.reserved_items)
          ? booking.reserved_items
          : []) as string[],
      },
      includeIntake: false,
      paymentAmount: balance > 0 ? balance : Number(booking.price),
    });
    await sendStudioAndCustomer({
      customerEmail,
      subject: `בקשת תשלום — שריון #${booking.id.slice(0, 8)} · Sweetbaby`,
      html,
    });
    return { ok: true };
  });
