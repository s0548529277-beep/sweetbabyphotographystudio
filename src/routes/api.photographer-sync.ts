import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Receives newborn package orders from the photographer site (michalsiboni.co.il)
// and mirrors them into this studio's `newborn_package_orders` (so income / debts
// show in /admin/finance) + blocks the studio hours. Auth: header `x-sync-secret`
// must equal app_settings.photographer_sync_secret. Idempotent by external_id.
const FIELDS = [
  "package_id", "addons", "base_price", "addons_price", "total_price",
  "contact_name", "contact_phone", "contact_email", "session_date", "session_time",
  "notes", "amount_paid", "last_payment_at", "birth_basket_used",
  "date_deposit_at", "shoot_done_at", "photos_sent_at", "payment_done_at",
  "editing_done_at", "album_design_done_at", "printing_done_at", "delivered_at",
] as const;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/photographer-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { data: s } = await db.from("app_settings").select("value").eq("key", "photographer_sync_secret").maybeSingle();
        const secret = request.headers.get("x-sync-secret");
        if (!s?.value || secret !== s.value) return json(401, { error: "unauthorized" });

        let body: any;
        try { body = await request.json(); } catch { return json(400, { error: "bad json" }); }
        const op = body?.op;
        const id = String(body?.order?.id ?? body?.id ?? "");
        if (!id) return json(400, { error: "missing id" });

        const { data: existing } = await db
          .from("newborn_package_orders")
          .select("id, blocking_booking_id, session_date, session_time, contact_name, contact_phone, total_price")
          .eq("external_source", "photographer").eq("external_id", id).maybeSingle();

        if (op === "delete") {
          if (existing) {
            if (existing.blocking_booking_id) await db.from("bookings").delete().eq("id", existing.blocking_booking_id);
            await db.from("newborn_package_orders").delete().eq("id", existing.id);
          }
          return json(200, { ok: true, deleted: !!existing });
        }

        const src = body.order ?? {};
        const row: Record<string, unknown> = {};
        for (const f of FIELDS) if (src[f] !== undefined) row[f] = src[f];
        if (!row.package_id || !row.contact_name || !row.contact_phone) return json(400, { error: "missing required fields" });
        if (src.created_at) row.created_at = src.created_at;

        let orderId: string;
        if (existing) {
          const { error } = await db.from("newborn_package_orders").update(row).eq("id", existing.id);
          if (error) return json(500, { error: error.message });
          orderId = existing.id;
        } else {
          const { data, error } = await db.from("newborn_package_orders")
            .insert({ ...row, external_source: "photographer", external_id: id }).select("id").single();
          if (error) return json(500, { error: error.message });
          orderId = data.id;
        }

        // Block the studio hours (same helper the studio's own orders use).
        const { data: o } = await db.from("newborn_package_orders")
          .select("id, contact_name, contact_phone, session_date, session_time, total_price, blocking_booking_id").eq("id", orderId).single();
        const changed = !existing || existing.session_date !== o.session_date || existing.session_time !== o.session_time
          || existing.contact_name !== o.contact_name || existing.contact_phone !== o.contact_phone;
        let block: unknown = "unchanged";
        if (changed) {
          const { data: admin } = await db.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
          if (admin?.user_id) {
            const { syncNewbornBookingBlock } = await import("@/lib/newborn-orders.functions");
            block = await syncNewbornBookingBlock(db, admin.user_id, o);
          }
        }
        return json(200, { ok: true, id: orderId, block });
      },
    },
  },
});
