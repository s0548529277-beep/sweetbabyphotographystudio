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
      .select(data.kind === "order" ? "id, user_id, status, credit_used" : "id, user_id, status, credit_used, google_event_id")
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

      const creditUsed = Number((row as { credit_used?: number }).credit_used ?? 0);
      if (creditUsed > 0) {
        try {
          await supabaseAdmin.rpc("adjust_loyalty_credit", { p_user_id: row.user_id, p_delta: creditUsed });
        } catch (e) {
          console.error("[SWEETBABY] credit refund on admin cancel failed", e);
        }
      }

      const googleEventId = (row as { google_event_id?: string }).google_event_id;
      if (data.kind === "booking" && googleEventId) {
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
