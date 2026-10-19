// Server-only pieces of the "צילומי חוץ" (outdoor/location photography)
// lead tracker — see outdoor_package_orders/outdoor_package_types
// (20261020000000_outdoor_package_orders.sql) and outdoorContract.ts.
// Deliberately NOT a full CRUD file like newborn-orders.functions.ts: both
// tables have an admin-only RLS policy, so the admin UI
// (admin.outdoor-packages.tsx) talks to them directly via the authenticated
// browser client — same pattern already used by admin.coupons.tsx. Only
// what genuinely needs the server (sending a Gmail email) lives here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildOutdoorContractHtml } from "@/lib/outdoorContract";

const STUDIO_EMAIL = "s0548529277@gmail.com";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/** Sends the fixed "תיאום ציפיות" contract to the order's client (and the studio), filled in with that order's own package/date/time, then stamps contract_sent_at. */
export const sendOutdoorContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: order, error } = await (context.supabase as any)
      .from("outdoor_package_orders")
      .select("id, contact_name, contact_email, package_name, package_description, total_price, session_date, session_time")
      .eq("id", data.id)
      .single();
    if (error || !order) throw new Error(error?.message ?? "הזמנה לא נמצאה");
    if (!order.contact_email) throw new Error("לא נמצאה כתובת מייל ללקוחה הזו");
    if (!order.session_date) throw new Error("יש להגדיר תאריך צילום לפני שליחת החוזה");

    const html = buildOutdoorContractHtml({
      contactName: order.contact_name,
      sessionDate: order.session_date,
      sessionTime: order.session_time ?? null,
      packageName: order.package_name ?? null,
      packageDescription: order.package_description ?? null,
      totalPrice: order.total_price != null ? Number(order.total_price) : null,
    });

    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const subject = `תיאום ציפיות — החוזה שלך · מיכל סיבוני 💗`;
    await Promise.all(
      [order.contact_email, STUDIO_EMAIL].map((to) => sendGmail({ to, subject, html })),
    );

    await (context.supabase as any)
      .from("outdoor_package_orders")
      .update({ contract_sent_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

// Nudges the studio owner about an upcoming styling call once, a day
// before it's due — not an opt-in on the client's side (there's no client
// account here to opt in from), just the "שהמערכת תשלח התראה על זה" the
// owner asked for directly. Dedup is the same "stamp a *_sent_at column,
// skip if already set" pattern as every other one-shot reminder in this
// app (e.g. styling_call_reminder_sent_at mirrors contract_sent_at).
export async function runDueOutdoorStylingCallReminders(): Promise<{ checked: number; notified: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 1);
  const horizonStr = horizon.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const { data: candidates, error } = await (supabaseAdmin as any)
    .from("outdoor_package_orders")
    .select("id, contact_name, contact_phone, styling_call_date")
    .is("styling_call_reminder_sent_at", null)
    .not("styling_call_date", "is", null)
    .gte("styling_call_date", todayStr)
    .lte("styling_call_date", horizonStr);
  if (error) {
    console.error("[SWEETBABY] outdoor styling-call reminder scan failed", error);
    return { checked: 0, notified: 0 };
  }

  let notified = 0;
  for (const o of candidates ?? []) {
    try {
      const { sendGmail } = await import("@/integrations/google/gmail.server");
      await sendGmail({
        to: STUDIO_EMAIL,
        subject: `🔔 תזכורת: שיחת סטיילינג מתוכננת — ${o.contact_name}`,
        html: `<div dir="rtl" style="font-family:sans-serif">
          <p>תזכורת לשיחת סטיילינג עם <b>${o.contact_name}</b> (${o.contact_phone}), בתאריך ${o.styling_call_date}.</p>
        </div>`,
      });
      await (supabaseAdmin as any)
        .from("outdoor_package_orders")
        .update({ styling_call_reminder_sent_at: new Date().toISOString() })
        .eq("id", o.id);
      notified++;
    } catch (e) {
      console.error("[SWEETBABY] outdoor styling-call reminder send failed", o.id, e);
    }
  }
  return { checked: (candidates ?? []).length, notified };
}
