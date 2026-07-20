import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const lineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  sku: z.string(),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1),
  session_date: z.string().min(10), // rental start date (יום הצילום)
  return_date: z.string().min(10),  // rental end date (חובה — לפחות אותו יום)
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

    const ids = data.lines.map((l) => l.id);
    const { data: items, error: itemsErr } = await supabase
      .from("items")
      .select("id, name, sku, price, active, stock_quantity")
      .in("id", ids);
    if (itemsErr) throw new Error(itemsErr.message);

    const byId = new Map(items?.map((i) => [i.id, i]) ?? []);
    let total = 0;
    const orderLines = data.lines.map((l) => {
      const server = byId.get(l.id);
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
    const { data: overlaps, error: takenErr } = await supabase
      .from("item_availability")
      .select("item_id")
      .in("item_id", ids)
      .lte("start_date", endDate)
      .gte("end_date", startDate);
    if (takenErr) throw new Error(takenErr.message);

    const takenCount = new Map<string, number>();
    for (const t of overlaps ?? []) {
      takenCount.set(t.item_id, (takenCount.get(t.item_id) ?? 0) + 1);
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

    const { error: linesErr } = await supabase
      .from("order_items")
      .insert(orderLines.map((l) => ({
        order_id: order.id,
        item_id: l.item_id,
        item_name: l.item_name,
        item_sku: l.item_sku,
        quantity: l.quantity,
        price: l.price,
      })));
    if (linesErr) throw new Error(linesErr.message);

    // Lock availability slots for the rental range (one row per unit).
    const availabilityRows: {
      item_id: string;
      order_id: string;
      date: string; // kept for backward compatibility
      start_date: string;
      end_date: string;
      slot_index: number;
    }[] = [];
    for (const l of orderLines) {
      const busy = takenCount.get(l.item_id) ?? 0;
      for (let i = 0; i < l.quantity; i++) {
        availabilityRows.push({
          item_id: l.item_id,
          order_id: order.id,
          date: startDate,
          start_date: startDate,
          end_date: endDate,
          slot_index: busy + i,
        });
      }
    }
    if (availabilityRows.length) {
      const { error: availErr } = await supabase.from("item_availability").insert(availabilityRows);
      if (availErr) {
        await supabase.from("orders").delete().eq("id", order.id);
        throw new Error("הפריטים נתפסו בתאריכים אלה. בבקשה נסי שוב.");
      }
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "order",
        title: `הזמנת אביזרים חדשה · ₪${total}`,
        body: {
          order_id: order.id,
          total, deposit: depositAmount, balance: balanceAmount,
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
    } catch (e) { console.error("[SWEETBABY] admin notify failed", e); }

    return { id: order.id, total, deposit: depositAmount, balance: balanceAmount };
  });

// Public availability check server fn (client uses it to disable unavailable items)
const availSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1).max(200),
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

    const [avail, items] = await Promise.all([
      supabaseAdmin
        .from("item_availability")
        .select("item_id")
        .in("item_id", data.item_ids)
        .lte("start_date", to)
        .gte("end_date", from),
      supabaseAdmin
        .from("items")
        .select("id, stock_quantity")
        .in("id", data.item_ids),
    ]);
    if (avail.error) throw new Error(avail.error.message);
    if (items.error) throw new Error(items.error.message);

    const busy = new Map<string, number>();
    for (const r of avail.data ?? []) busy.set(r.item_id, (busy.get(r.item_id) ?? 0) + 1);
    const stock = new Map<string, number>();
    for (const r of items.data ?? []) stock.set(r.id, Number(r.stock_quantity ?? 1));

    const result: Record<string, { stock: number; taken: number; available: number }> = {};
    for (const id of data.item_ids) {
      const s = stock.get(id) ?? 1;
      const t = busy.get(id) ?? 0;
      result[id] = { stock: s, taken: t, available: Math.max(0, s - t) };
    }
    return result;
  });
