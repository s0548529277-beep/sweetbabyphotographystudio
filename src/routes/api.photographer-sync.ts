import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Two-way sync of newborn package orders with the photographer site (michalsiboni.co.il).
// Header `x-sync-secret` must equal app_settings.photographer_sync_secret (checked again inside the
// database function apply_remote_order, migration 0044). The database function does the writing, so the
// transaction-local flag `app.syncing` is set and our own trigger does not echo the change back.
//
//  * native order of the photographer site  -> mirror row here (external_source = 'photographer');
//    studio hours are blocked like for any studio order (only when date/time/name/phone changed)
//  * edit of the photographer site's mirror of one of OUR orders (external_source = 'studio')
//    -> the same fields are copied onto our native order; its studio block + calendar event follow
//  * delete of a native photographer order -> our mirror + its hours block are removed
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ORDER_COLS =
  "id, contact_name, contact_phone, contact_email, session_date, session_time, total_price, blocking_booking_id, google_event_id";

export const Route = createFileRoute("/api/photographer-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const secret = request.headers.get("x-sync-secret") ?? "";

        let body: any;
        try { body = await request.json(); } catch { return json(400, { error: "bad json" }); }
        const op = body?.op === "delete" ? "delete" : "upsert";
        const src: Record<string, any> = body?.order && typeof body.order === "object" ? body.order : {};
        const id = String(src.id ?? body?.id ?? "");
        if (!id) return json(400, { error: "missing id" });

        // The photographer site's mirror of one of OUR native orders: edits go back onto our order.
        const backToNative = src.external_source === "studio" && !!src.external_id;

        // State before the change (to know whether the hours block / calendar event must move).
        let before: any = null;
        if (backToNative) {
          if (op !== "delete") {
            const r = await db.from("newborn_package_orders").select(ORDER_COLS)
              .eq("id", String(src.external_id)).is("external_source", null).maybeSingle();
            before = r.data;
          }
        } else if (!src.external_source) {
          const r = await db.from("newborn_package_orders").select(ORDER_COLS)
            .eq("external_source", "photographer").eq("external_id", id).maybeSingle();
          before = r.data;
        }

        const payload = op === "delete"
          ? { id, external_source: src.external_source ?? null, external_id: src.external_id ?? null }
          : { ...src, id };
        const { data: res, error } = await db.rpc("apply_remote_order", { p_secret: secret, p_op: op, p_order: payload });
        if (error) {
          const m = String(error.message ?? "");
          if (m.includes("unauthorized")) return json(401, { error: "unauthorized" });
          if (m.includes("missing")) return json(400, { error: m });
          return json(500, { error: m });
        }

        if (op === "delete") {
          // The mirror row is gone; its hours block (a booking) is not tied to it by a cascade.
          if (before?.blocking_booking_id) await db.from("bookings").delete().eq("id", before.blocking_booking_id);
          return json(200, { ok: true, ...(res ?? {}) });
        }

        const targetId: string | null = backToNative ? String(src.external_id) : (res?.id ?? null);
        if (!targetId) return json(200, { ok: true, ...(res ?? {}) });
        const { data: o } = await db.from("newborn_package_orders").select(ORDER_COLS).eq("id", targetId).maybeSingle();
        if (!o) return json(200, { ok: true, ...(res ?? {}) });

        const changed = !before || before.session_date !== o.session_date || before.session_time !== o.session_time
          || before.contact_name !== o.contact_name || before.contact_phone !== o.contact_phone
          || (backToNative && before.contact_email !== o.contact_email);
        let block: unknown = "unchanged";
        let calendarError: string | null = null;
        if (changed) {
          const { data: admin } = await db.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
          if (admin?.user_id) {
            const mod = await import("@/lib/newborn-orders.functions");
            block = await mod.syncNewbornBookingBlock(db, admin.user_id, o);
            // Our own orders also have a Google Calendar event; mirrors of the photographer site's orders do not.
            if (backToNative) calendarError = await mod.syncNewbornCalendarEvent(db, o);
          }
        }
        return json(200, { ok: true, id: targetId, action: res?.action ?? null, block, calendarError });
      },
    },
  },
});
