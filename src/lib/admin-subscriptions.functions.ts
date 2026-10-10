// Admin-only server functions for the studio-visit pass system
// (subscription_plans / subscription_passes — see /admin/subscriptions).
// Plan CRUD and simple pass create/cancel stay as direct client-side
// Supabase calls in the admin page itself (RLS already grants admins full
// access there, same pattern as every other admin.*.tsx page in this app)
// — this file exists only for the one operation that needs the
// service-role-only atomic RPC: manually adjusting a pass's entry count.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/**
 * Manually adds or removes entries on a pass (e.g. a goodwill extra visit,
 * or correcting a mistake) — always with a note, logged to
 * subscription_pass_adjustments for the pass's own history view. Uses the
 * atomic adjust_subscription_pass_entries RPC (clamped to [0, total_entries]
 * in one UPDATE) rather than read-then-write, same reasoning as the
 * redemption path in bookings.functions.ts.
 */
export const adminAdjustSubscriptionPassEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pass_id: z.string().uuid(),
        delta: z
          .number()
          .int()
          .refine((n) => n !== 0, "יש לבחור שינוי שונה מאפס"),
        note: z.string().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: newCount, error: rpcError } = await supabaseAdmin.rpc(
      "adjust_subscription_pass_entries",
      {
        p_pass_id: data.pass_id,
        p_delta: data.delta,
      },
    );
    if (rpcError) throw new Error(rpcError.message);
    const { error: logError } = await supabaseAdmin.from("subscription_pass_adjustments").insert({
      pass_id: data.pass_id,
      delta: data.delta,
      note: data.note.trim(),
      created_by: context.userId,
    });
    if (logError) throw new Error(logError.message);
    return { entries_used: newCount };
  });

/**
 * Approves a self-serve pass purchase sitting in 'pending_approval'
 * (purchaseSubscriptionPass, subscription-purchase.functions.ts), flipping
 * it to 'active' — the point it actually becomes usable (every real read
 * of subscription_passes already filters status='active') — and sends the
 * customer her "your pass is active" confirmation email, which the
 * original purchase email promised would come.
 */
export const adminApproveSubscriptionPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pass_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pass, error: fetchErr } = await supabaseAdmin
      .from("subscription_passes")
      .select("id, user_id, plan_name, total_entries, expires_at, status")
      .eq("id", data.pass_id)
      .maybeSingle();
    if (fetchErr || !pass) throw new Error("הכרטיסייה לא נמצאה");
    if (pass.status !== "pending_approval") throw new Error("הכרטיסייה הזו כבר אינה ממתינה לאישור");

    const { error: upErr } = await supabaseAdmin
      .from("subscription_passes")
      .update({ status: "active", approved_at: new Date().toISOString() })
      .eq("id", data.pass_id);
    if (upErr) throw new Error(upErr.message);

    try {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(pass.user_id);
      const customerEmail = user?.email;
      if (customerEmail) {
        const { sendGmail } = await import("@/integrations/google/gmail.server");
        const html = `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto">
          <h2>הכרטיסייה שלך אושרה ופעילה! 🎟️</h2>
          <p>${pass.plan_name} — ${pass.total_entries} כניסות, בתוקף עד ${new Date(pass.expires_at).toLocaleDateString("he-IL")}.</p>
          <p>כל כניסה מכסה את השעה הראשונה בהשכרת סטודיו לפי שעה — שעות נוספות בתשלום רגיל.</p>
        </div>`;
        await sendGmail({ to: customerEmail, subject: `הכרטיסייה שלך אושרה — ${pass.plan_name}`, html });
      }
    } catch (e) {
      console.error("[SWEETBABY] pass approval email failed", e);
    }

    return { ok: true };
  });
