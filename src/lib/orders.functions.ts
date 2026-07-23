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
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  camera_model: z.string().min(1).max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  terms_accepted: z.literal(true),
});

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

    const byId = new Map(items?.map((i) => [i.sku, i]) ?? []);
    let total = 0;
    const orderLines = data.lines.map((l) => {
      const server = byId.get(l.sku);
      if (!server || !server.active) throw new Error(`פריט לא זמין: ${l.name}`);
      const price = Number(server.price);
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
      const { data: reservedCount, error: countErr } = await adminForCount.rpc(
        "count_item_reservations",
        { _item_id: l.item_id, _from: startDate, _to: endDate }
      );
      if (countErr) throw new Error(countErr.message);
      takenCount.set(l.item_id, reservedCount ?? 0);
    }
    }
    for (const l of orderLines) {
      const busy = takenCount.get(l.item_id) ?? 0;
      if (busy + l.quantity > l.stock) {
        throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים שנבחרו`);
      }
    }

    // Same-day → 100% up front; else 90 deposit
    const today = new Date().toISOString().slice(0, 10);
    const sameDay = data.session_date === today;
    const depositAmount = sameDay ? total : 90;
    const balanceAmount = Math.max(0, total - depositAmount);

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
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        camera_model: data.camera_model ?? null,
        notes: data.notes ?? null,
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
     await supabaseAdmin.from("item_availability").delete().eq("order_id", order.id);
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

    return { id: order.id, total, deposit: depositAmount, balance: balanceAmount };
  });

// Public availability check server fn (client uses it to disable unavailable items)
const availSchema = z.object({
  skus: z.array(z.string().min(1)).min(1).max(200),
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
      const s = stockBySku.get(sku) ?? 1;
      const t = realId ? (busyByRealId.get(realId) ?? 0) : 0;
      result[sku] = { stock: s, taken: t, available: Math.max(0, s - t) };
    }
    return result;
  });
