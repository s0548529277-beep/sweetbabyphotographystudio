// Self-serve, card-only purchase of a studio-visit pass (e.g. the 5-entry
// card) — the one alternative to an admin creating a pass by hand after a
// bank transfer (see /admin/subscriptions). No real payment-gateway API
// exists anywhere in this app (even booking/order deposits use a static
// Takbull pay link plus a self-reported "I paid" confirmation) — this
// follows that same trust-then-verify model, but per explicit request a
// self-serve pass purchase no longer activates itself: it lands as
// status='pending_approval' (unusable — every real read of
// subscription_passes already filters status='active') until the studio
// owner approves it herself in /admin/subscriptions
// (adminApproveSubscriptionPass, admin-subscriptions.functions.ts), which
// is also when the customer's "your pass is active" email actually goes
// out. See runDuePendingPassApprovalNudges below for the repeated
// "please approve this" reminder while it waits.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STUDIO_EMAIL = "s0548529277@gmail.com";

/**
 * subscription_plans' only RLS policy is admin-only (see
 * 20260823090000_add_subscription_passes.sql) — a customer's own client
 * can't read it directly, so the purchase page needs this to show what's
 * available to buy. Server-side, via supabaseAdmin, returning only the
 * fields a customer should see (not `active` itself — already filtered).
 */
export const listActiveSubscriptionPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name, total_entries, price, validity_months")
      .eq("active", true)
      .order("price", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const purchaseSubscriptionPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // subscription_plans/subscription_passes both have admin-only RLS
    // policies (same file as above) — every read/write here has to go
    // through supabaseAdmin, never the customer-scoped `supabase` client.
    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name, total_entries, price, validity_months, active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planError || !plan) throw new Error("החבילה לא נמצאה");
    if (!plan.active) throw new Error("החבילה הזו כבר לא זמינה לרכישה");

    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setMonth(expiresAt.getMonth() + Number(plan.validity_months));

    const { data: pass, error: insertError } = await supabaseAdmin
      .from("subscription_passes")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        plan_name: plan.name,
        total_entries: plan.total_entries,
        price_paid: Number(plan.price),
        status: "pending_approval",
        purchase_source: "online_card",
        expires_at: expiresAt.toISOString(),
        notes: "נרכש עצמאית באתר באשראי — ממתין לאישור הסטודיו",
      })
      .select("id")
      .single();
    if (insertError || !pass) throw new Error(insertError?.message ?? "יצירת הכרטיסייה נכשלה");

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", userId)
        .maybeSingle();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const customerEmail = user?.email ?? null;

      await supabaseAdmin.from("admin_notifications").insert({
        type: "subscription_pass",
        title: `כרטיסייה ממתינה לאישורך · ${plan.name} · ₪${plan.price}`,
        body: {
          pass_id: pass.id,
          plan_name: plan.name,
          price: Number(plan.price),
          customer_name: profile?.full_name ?? null,
          customer_phone: profile?.phone ?? null,
          customer_email: customerEmail,
        },
      });

      const { sendGmail } = await import("@/integrations/google/gmail.server");
      const studioHtml = `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto">
        <h2>בקשה לכרטיסייה ממתינה לאישורך 🎟️</h2>
        <p>${profile?.full_name ?? "לקוחה"} ביקשה לרכוש ${plan.name} (₪${plan.price}) באשראי.</p>
        <p>יש לאשר תשלום מול Takbull ואז לאשר את הכרטיסייה ב-/admin/subscriptions כדי שתופעל.</p>
      </div>`;
      const customerHtml = `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto">
        <h2>הבקשה שלך התקבלה! 🎟️</h2>
        <p>${plan.name} — ${plan.total_entries} כניסות, בתוקף עד ${expiresAt.toLocaleDateString("he-IL")} (מתחיל מרגע האישור).</p>
        <p>הבקשה ממתינה כעת לאישור הצוות — יישלח אליך מייל אישור ברגע שהכרטיסייה תופעל.</p>
      </div>`;
      await Promise.all([
        sendGmail({ to: STUDIO_EMAIL, subject: `כרטיסייה ממתינה לאישור — ${plan.name}`, html: studioHtml }),
        customerEmail ? sendGmail({ to: customerEmail, subject: `הבקשה שלך לכרטיסייה התקבלה — ${plan.name}`, html: customerHtml }) : Promise.resolve(),
      ]);
    } catch (e) {
      console.error("[SWEETBABY] subscription pass purchase notify failed", e);
    }

    return { id: pass.id, expires_at: expiresAt.toISOString() };
  });

// How close together repeated "please approve this" nudges to the studio
// owner can be — see runDuePendingPassApprovalNudges.
const APPROVAL_NUDGE_INTERVAL_HOURS = 12;
// Caps the nudging at ~3 days of reminders (6 × 12h) so a genuinely
// forgotten/ignored request doesn't page the owner forever — the pass is
// still sitting there, visible in /admin/subscriptions, whenever she does
// get to it.
const MAX_APPROVAL_NUDGES = 6;

/**
 * Repeated reminder email to the studio owner while a self-serve pass
 * purchase sits in 'pending_approval' — called from the same periodic
 * /api/send-booking-reminders cron hit as every other reminder job. Fires
 * at most once per APPROVAL_NUDGE_INTERVAL_HOURS per pass, up to
 * MAX_APPROVAL_NUDGES times, tracked on the pass row itself (not a
 * separate dedup table) since there's exactly one thing being nudged about
 * per pass.
 */
export async function runDuePendingPassApprovalNudges(): Promise<{ checked: number; nudged: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: candidates, error } = await supabaseAdmin
    .from("subscription_passes")
    .select("id, plan_name, price_paid, purchased_at, approval_nudge_count, approval_nudge_sent_at")
    .eq("status", "pending_approval")
    .lt("approval_nudge_count", MAX_APPROVAL_NUDGES);
  if (error) {
    console.error("[SWEETBABY] pending pass approval nudge scan failed", error);
    return { checked: 0, nudged: 0 };
  }

  const now = Date.now();
  let nudged = 0;
  for (const p of (candidates ?? []) as any[]) {
    const lastAt = p.approval_nudge_sent_at ? new Date(p.approval_nudge_sent_at).getTime() : new Date(p.purchased_at).getTime();
    const hoursSince = (now - lastAt) / (1000 * 60 * 60);
    if (hoursSince < APPROVAL_NUDGE_INTERVAL_HOURS) continue;
    try {
      const { sendGmail } = await import("@/integrations/google/gmail.server");
      const html = `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto">
        <h2>🔔 תזכורת: כרטיסייה ממתינה לאישורך</h2>
        <p>${p.plan_name} (₪${p.price_paid}) עדיין ממתינה לאישורך — אם התשלום התקבל, אפשר לאשר ב-<a href="https://sweetbabyphoto.shop/admin/subscriptions">פאנל הניהול</a>.</p>
      </div>`;
      await sendGmail({ to: STUDIO_EMAIL, subject: `🔔 תזכורת: כרטיסייה ממתינה לאישור — ${p.plan_name}`, html });
      await supabaseAdmin
        .from("subscription_passes")
        .update({ approval_nudge_count: (p.approval_nudge_count ?? 0) + 1, approval_nudge_sent_at: new Date().toISOString() })
        .eq("id", p.id);
      nudged++;
    } catch (e) {
      console.error("[SWEETBABY] pending pass approval nudge send failed", p.id, e);
    }
  }
  return { checked: (candidates ?? []).length, nudged };
}
