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
  scheduled_date: z.string().nullable().optional(),
  return_date: z.string().nullable().optional(),
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  notes: z.string().max(1000).optional().nullable(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify items and recompute total server-side
    const ids = data.lines.map((l) => l.id);
    const { data: items, error: itemsErr } = await supabase
      .from("items")
      .select("id, name, sku, price, active")
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
      };
    });

    if (total < 50) throw new Error("מינימום הזמנה 50 ש״ח");

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        status: "pending",
        total,
        scheduled_date: data.scheduled_date || null,
        return_date: data.return_date || null,
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "יצירת הזמנה נכשלה");

    const { error: linesErr } = await supabase
      .from("order_items")
      .insert(orderLines.map((l) => ({ ...l, order_id: order.id })));
    if (linesErr) throw new Error(linesErr.message);

    // Admin notification: log to server console + queue-ready payload.
    // Wire to real email provider by dropping a fetch to Lovable Emails / Resend here.
    try {
      console.log("[SWEETBABY] New order", {
        id: order.id,
        total,
        contact: data.contact_name,
        phone: data.contact_phone,
        scheduled: data.scheduled_date,
        items: orderLines,
      });
    } catch {}

    return { id: order.id, total };
  });
