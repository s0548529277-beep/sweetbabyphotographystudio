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
  session_date: z.string().min(1), // required "מתי נתראה?"
  return_date: z.string().nullable().optional(),
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  camera_model: z.string().min(1).max(120),
  notes: z.string().max(1000).optional().nullable(),
  terms_accepted: z.literal(true),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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

    // Check availability for session_date
    const { data: taken, error: takenErr } = await supabase
      .from("item_availability")
      .select("item_id, slot_index")
      .in("item_id", ids)
      .eq("date", data.session_date);
    if (takenErr) throw new Error(takenErr.message);

    const takenCount = new Map<string, number>();
    for (const t of taken ?? []) {
      takenCount.set(t.item_id, (takenCount.get(t.item_id) ?? 0) + 1);
    }
    for (const l of orderLines) {
      const busy = takenCount.get(l.item_id) ?? 0;
      if (busy + l.quantity > l.stock) {
        throw new Error(`הפריט "${l.item_name}" לא זמין בתאריך שנבחר`);
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
        return_date: data.return_date || null,
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        camera_model: data.camera_model,
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

    // Lock availability slots (one row per unit)
    const availabilityRows: { item_id: string; date: string; order_id: string; slot_index: number }[] = [];
    for (const l of orderLines) {
      const busy = takenCount.get(l.item_id) ?? 0;
      for (let i = 0; i < l.quantity; i++) {
        availabilityRows.push({
          item_id: l.item_id,
          date: data.session_date,
          order_id: order.id,
          slot_index: busy + i,
        });
      }
    }
    if (availabilityRows.length) {
      const { error: availErr } = await supabase.from("item_availability").insert(availabilityRows);
      if (availErr) {
        // Rollback order if concurrent booking snuck in
        await supabase.from("orders").delete().eq("id", order.id);
        throw new Error("הפריטים נתפסו לתאריך זה. בבקשה נסי שוב.");
      }
    }

    try {
      console.log("[SWEETBABY] New props order", {
        id: order.id, total, deposit: depositAmount, balance: balanceAmount,
        contact: data.contact_name, phone: data.contact_phone,
        camera: data.camera_model, session_date: data.session_date,
      });
    } catch {}

    return { id: order.id, total, deposit: depositAmount, balance: balanceAmount };
  });
