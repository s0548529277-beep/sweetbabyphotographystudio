// Self-serve, card-only purchase of a studio-visit pass (e.g. the 5-entry
// card) — the one alternative to an admin creating a pass by hand after a
// bank transfer (see /admin/subscriptions). No real payment-gateway API
// exists anywhere in this app (even booking/order deposits use a static
// Takbull pay link plus a self-reported "I paid" confirmation the admin
// verifies afterward — see /deposit/$type/$id) — this follows the exact
// same trust-then-verify model: the pass activates immediately on the
// customer's own confirmation, tagged purchase_source='online_card' so
// /admin/subscriptions can tell it apart from an admin-created one, and the
// studio owner is notified to reconcile it against her Takbull dashboard.
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
        status: "active",
        purchase_source: "online_card",
        expires_at: expiresAt.toISOString(),
        notes: "נרכש עצמאית באתר באשראי — ממתין לאימות תשלום מול Takbull",
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
        title: `כרטיסייה חדשה נרכשה באשראי · ₪${plan.price}`,
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
      const subject = `כרטיסייה נרכשה — ${plan.name}`;
      const html = `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto">
        <h2>הכרטיסייה שלך פעילה! 🎟️</h2>
        <p>${plan.name} — ${plan.total_entries} כניסות, בתוקף עד ${expiresAt.toLocaleDateString("he-IL")}.</p>
        <p>כל כניסה מכסה את השעה הראשונה בהשכרת סטודיו לפי שעה — שעות נוספות בתשלום רגיל.</p>
      </div>`;
      await Promise.all([
        sendGmail({ to: STUDIO_EMAIL, subject, html }),
        customerEmail ? sendGmail({ to: customerEmail, subject, html }) : Promise.resolve(),
      ]);
    } catch (e) {
      console.error("[SWEETBABY] subscription pass purchase notify failed", e);
    }

    return { id: pass.id, expires_at: expiresAt.toISOString() };
  });
