import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const lineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1),
  session_date: z.string().min(10), // rental start date (יום הצילום)
  return_date: z.string().min(10), // rental end date (חובה — לפחות אותו יום)
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  camera_model: z.string().min(1).max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  terms_accepted: z.literal(true),
});

// Round up rental duration (in hours) to whole 24h units; min 1.
function computeDayMultiplier(startISO: string, endISO: string): number {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!isFinite(ms) || ms <= 0) return 1;
  const hours = ms / (1000 * 60 * 60);
  return Math.max(1, Math.ceil(hours / 24));
}

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const startDate = data.session_date;
    const endDate = data.return_date >= data.session_date ? data.return_date : data.session_date;

    const skus = data.lines.map((l) => l.sku);
    const { data: items, error: itemsErr } = await supabase
      .from("items")
      .select("id, name, sku, price, active, stock_quantity")
      .in("sku", skus);
    if (itemsErr) throw new Error(itemsErr.message);

    // Compute how many 24h units this rental covers. If specific times were
    // provided, use them; otherwise use full days between the two dates.
    const startISO = `${startDate}T${data.start_time ?? "09:00"}:00`;
    const endISO = `${endDate}T${data.end_time ?? data.start_time ?? "18:00"}:00`;
    const dayMultiplier = computeDayMultiplier(startISO, endISO);

    const byId = new Map(items?.map((i) => [i.sku, i]) ?? []);
    let total = 0;
    const orderLines = data.lines.map((l) => {
      const server = byId.get(l.sku);
      if (!server || !server.active) throw new Error(`פריט לא זמין: ${l.name}`);
      const basePrice = Number(server.price);
      const price = basePrice * dayMultiplier;
      total += price * l.quantity;
      return {
        item_id: server.id,
        item_name: server.name,
        item_sku: server.sku,
        quantity: l.quantity,
        price,
        stock: Number(server.stock_quantity ?? 1),
      };
    });

    if (total < 50) throw new Error("מינימום הזמנה 50 ש״ח");

    // Date-range availability check: any existing reservation whose range
    // overlaps [startDate, endDate] counts as taken for that item.
    const { supabaseAdmin: adminForCount } = await import("@/integrations/supabase/client.server");
    const takenCount = new Map<string, number>();
    for (const l of orderLines) {
      const { data: reservedCount, error: countErr } = await adminForCount.rpc("count_item_reservations", {
        _item_id: l.item_id,
        _from: startDate,
        _to: endDate,
      });
      if (countErr) throw new Error(countErr.message);
      takenCount.set(l.item_id, reservedCount ?? 0);
    }

    for (const l of orderLines) {
      const busy = takenCount.get(l.item_id) ?? 0;
      if (busy + l.quantity > l.stock) {
        throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים שנבחרו`);
      }
    }

    // Full payment up front — no deposit split.
    const depositAmount = total;
    const balanceAmount = 0;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        status: "pending",
        track: "props",
        total,
        session_date: data.session_date,
        scheduled_date: data.session_date,
        return_date: endDate,
        pickup_at: startISO,
        return_at: endISO,
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        camera_model: data.camera_model ?? null,
        notes: [
          data.start_time && data.end_time
            ? `שעות השכרה: ${data.start_time}–${data.end_time} · ${dayMultiplier} יח׳ של 24ש (מכפיל x${dayMultiplier})`
            : null,
          data.notes,
        ].filter(Boolean).join("\n") || null,
        deposit_amount: depositAmount,
        balance_amount: balanceAmount,
        deposit_status: "pending",
        terms_accepted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "יצירת הזמנה נכשלה");

    const { error: linesErr } = await supabase.from("order_items").insert(
      orderLines.map((l) => ({
        order_id: order.id,
        item_id: l.item_id,
        item_name: l.item_name,
        item_sku: l.item_sku,
        quantity: l.quantity,
        price: l.price,
      })),
    );
    if (linesErr) throw new Error(linesErr.message);

    // Lock availability slots for the rental range. Insert row-by-row so a
    // unique-conflict on (item_id, start_date, end_date, slot_index) — from a
    // concurrent booking — is retried with the next slot_index up to `stock`.
    const insertOne = async (l: (typeof orderLines)[number]) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const start = takenCount.get(l.item_id) ?? 0;
      for (let attempt = start; attempt < l.stock + 8; attempt++) {
        const { error } = await supabaseAdmin.from("item_availability").insert({
          item_id: l.item_id,
          order_id: order.id,
          date: startDate,
          start_date: startDate,
          end_date: endDate,
          slot_index: attempt,
        });
        if (!error) {
          takenCount.set(l.item_id, attempt + 1);
          return;
        }
        // 23505 = unique_violation. Any other error is fatal.
        // Retry only on conflicts, and only while slots are theoretically free.
        const isConflict =
          (error as { code?: string }).code === "23505" || /duplicate|unique/i.test(error.message ?? "");
        if (!isConflict) throw new Error(error.message);
        // If we've exhausted stock, real conflict — no unit available.
        if (attempt + 1 >= l.stock) break;
      }
      throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים שנבחרו`);
    };

    try {
      for (const l of orderLines) {
        for (let i = 0; i < l.quantity; i++) await insertOne(l);
      }
    } catch (e) {
      // Rollback: delete inserted availability rows + order.
      await adminForCount.from("item_availability").delete().eq("order_id", order.id);
      await supabase.from("orders").delete().eq("id", order.id);
      throw e;
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "order",
        title: `הזמנת אביזרים חדשה · ₪${total}`,
        body: {
          order_id: order.id,
          total,
          deposit: depositAmount,
          balance: balanceAmount,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone,
          camera_model: data.camera_model ?? null,
          session_date: data.session_date,
          return_date: endDate,
          items: orderLines.map((l) => ({ sku: l.item_sku, name: l.item_name, qty: l.quantity, price: l.price })),
          notes: data.notes ?? null,
        },
      });
      console.log("[SWEETBABY] New props order", { id: order.id, total, deposit: depositAmount });
    } catch (e) {
      console.error("[SWEETBABY] admin notify failed", e);
    }

    // Send confirmation emails (customer + studio) from the studio's Gmail.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customerEmail = user?.email;
      const itemsHtml = orderLines
        .map((l) => `<tr><td style="padding:4px 8px">${l.item_name} (${l.item_sku})</td><td style="padding:4px 8px">×${l.quantity}</td><td style="padding:4px 8px;text-align:left">₪${(l.price * l.quantity).toFixed(0)}</td></tr>`)
        .join("");
      const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:560px;margin:auto">
        <h2 style="color:#2d3d2b">ההזמנה שלך התקבלה 💗</h2>
        <p>שלום ${data.contact_name},</p>
        <p>תודה על ההזמנה בסטודיו Sweetbaby. פרטי ההזמנה:</p>
        <p><strong>איסוף:</strong> ${data.session_date} · <strong>החזרה:</strong> ${endDate}</p>
        <table style="width:100%;border-collapse:collapse;background:#faf7f4">${itemsHtml}</table>
        <p style="margin-top:16px"><strong>סה״כ:</strong> ₪${total} · <strong>מקדמה:</strong> ₪${depositAmount} · <strong>יתרה:</strong> ₪${balanceAmount}</p>
        <p style="color:#6b8a63;font-size:13px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: s0548529277@gmail.com / 054-8529277</p>
      </div>`;
      const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
      await sendStudioAndCustomer({
        customerEmail,
        subject: `אישור הזמנה #${order.id.slice(0, 8)} · Sweetbaby`,
        html,
      });
    } catch (e) {
      console.error("[SWEETBABY] confirmation email failed", e);
    }



    return { id: order.id, total, deposit: depositAmount, balance: balanceAmount };
  });

// Public availability check server fn (client uses it to disable unavailable items)
const availSchema = z.object({
  skus: z.array(z.string().min(1)).min(1).max(600),
  from: z.string().min(10),
  to: z.string().min(10),
});


export const checkItemsAvailability = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => availSchema.parse(data))
  .handler(async ({ data }) => {
    // Use publishable server client — this is a public read gated by RLS on
    // item_availability (admin/owner reads only) but we only need aggregate
    // counts, so use service role via admin client but only to count rows.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = data.from;
    const to = data.to >= data.from ? data.to : data.from;

    const itemsRes = await supabaseAdmin.from("items").select("id, sku, stock_quantity").in("sku", data.skus);
    if (itemsRes.error) throw new Error(itemsRes.error.message);

    const items = itemsRes.data ?? [];
    const idsBySku = new Map(items.map((i) => [i.sku, i.id]));
    const stockBySku = new Map(items.map((i) => [i.sku, Number(i.stock_quantity ?? 1)]));
    const realIds = items.map((i) => i.id);

    const avail = await supabaseAdmin
      .from("item_availability")
      .select("item_id")
      .in("item_id", realIds)
      .lte("start_date", to)
      .gte("end_date", from);
    if (avail.error) throw new Error(avail.error.message);

    const busyByRealId = new Map<string, number>();
    for (const r of avail.data ?? []) busyByRealId.set(r.item_id, (busyByRealId.get(r.item_id) ?? 0) + 1);

    const result: Record<string, { stock: number; taken: number; available: number }> = {};
    for (const sku of data.skus) {
      const realId = idsBySku.get(sku);
      const s = realId ? (stockBySku.get(sku) ?? 1) : 0;
      const t = realId ? (busyByRealId.get(realId) ?? 0) : 0;
      result[sku] = { stock: s, taken: t, available: Math.max(0, s - t) };
    }
    return result;
  });
