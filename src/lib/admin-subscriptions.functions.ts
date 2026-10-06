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
