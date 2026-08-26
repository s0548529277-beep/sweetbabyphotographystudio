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

    const wasCancelled = row.status === "cancelled";
    const willBeCancelled = data.status === "cancelled";

    const { error: upErr } = await supabaseAdmin.from(table).update({ status: data.status }).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    // Only run cancellation cleanup on the transition INTO cancelled — not
    // on every save, and not again if it was already cancelled.
    if (willBeCancelled && !wasCancelled) {
      const idColumn = data.kind === "order" ? "order_id" : "booking_id";
      await supabaseAdmin.from("item_availability").delete().eq(idColumn, data.id);

      // Refund into whichever bucket the credit actually came from.
      const refundCashback = Number((row as { credit_used_cashback?: number }).credit_used_cashback ?? 0);
      const refundManual = Number((row as { credit_used_manual?: number }).credit_used_manual ?? 0);
      try {
        if (refundCashback > 0) {
          await supabaseAdmin.rpc("adjust_loyalty_credit", { p_user_id: row.user_id, p_delta: refundCashback, p_source: "cashback" });
        }
        if (refundManual > 0) {
          await supabaseAdmin.rpc("adjust_loyalty_credit", { p_user_id: row.user_id, p_delta: refundManual, p_source: "manual" });
        }
      } catch (e) {
        console.error("[SWEETBABY] credit refund on admin cancel failed", e);
      }

      const passId = (row as { subscription_pass_id?: string | null }).subscription_pass_id;
      if (passId) {
        const { data: p } = await supabaseAdmin.from("subscription_passes").select("entries_used").eq("id", passId).maybeSingle();
        if (p) {
          await supabaseAdmin
            .from("subscription_passes")
            .update({ entries_used: Math.max(0, Number(p.entries_used) - 1) })
            .eq("id", passId);
        }
      }

      const googleEventId = (row as { google_event_id?: string }).google_event_id;
      if (googleEventId) {
        try {
          const { deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
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
