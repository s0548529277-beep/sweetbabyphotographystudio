// Server-only: the actual "prize wheel" spin. The winning prize is ALWAYS
// picked here, never trusted from the client — the browser only plays the
// spin animation for whatever prize this returns (see PrizeWheel.tsx).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isEligibleForWheel, pickWeightedPrize, findWheelPrize } from "@/lib/wheel-prizes";

type SpinResult = { prizeId: string; label: string; detail: string; couponCode: string | null; alreadyWon: boolean };

/** Mints a real single-use coupon for this win, same pattern as newsletter.functions.ts's issuePersonalCoupon — a genuine, redeemable code, not just a promise. */
async function mintWheelCoupon(supabaseAdmin: any, percent: number, email: string | null, bookingId: string): Promise<string | null> {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const code = `WHEEL${percent}-${suffix}`;
  const { data, error } = await supabaseAdmin
    .from("coupons")
    .insert({
      code,
      discount_percent: percent,
      discount_amount: 0,
      active: true,
      single_use: true,
      issued_to_email: email,
    })
    .select("code")
    .single();
  if (error) {
    console.error("[SWEETBABY] wheel coupon mint failed", error, { bookingId });
    return null;
  }
  return data?.code ?? null;
}

export const spinWheel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SpinResult> => {
    const { supabase, userId } = context;
    // wheel_prize/wheel_prize_won_at are very recent columns — cast past
    // the generated types until they're regenerated (same pattern used for
    // bot_knowledge_notes/image_hash elsewhere in this codebase).
    const { data: b, error } = await (supabase as any)
      .from("bookings")
      .select("id, user_id, package, slots, contact_name, contact_phone, wheel_prize")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !b) throw new Error("ההזמנה לא נמצאה");
    if (b.user_id !== userId) throw new Error("אין הרשאה");

    // Already spun — return the SAME prize again (idempotent), never a
    // fresh one, so refreshing the page can't grant a second spin.
    if (b.wheel_prize) {
      const existing = findWheelPrize(b.wheel_prize);
      return { prizeId: b.wheel_prize, label: existing?.label ?? "", detail: existing?.detail ?? "", couponCode: null, alreadyWon: true };
    }

    if (!isEligibleForWheel(b)) throw new Error("ההזמנה הזו לא זכאית לסיבוב בגלגל המתנות");

    const prize = pickWeightedPrize();
    const { error: updErr } = await (supabase as any)
      .from("bookings")
      .update({ wheel_prize: prize.id, wheel_prize_won_at: new Date().toISOString() })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let couponCode: string | null = null;
    if (prize.kind === "coupon" && prize.couponPercent) {
      const { data: userRes } = await supabase.auth.getUser();
      couponCode = await mintWheelCoupon(supabaseAdmin, prize.couponPercent, userRes?.user?.email ?? null, b.id);
    }

    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "wheel_prize_won",
        title: `🎡 זכייה בגלגל המתנות · ${b.contact_name ?? ""} · ${prize.label}`,
        body: { booking_id: b.id, prize_id: prize.id, detail: prize.detail, phone: b.contact_phone, coupon_code: couponCode },
      });
    } catch (e) {
      console.error("[SWEETBABY] wheel win admin_notifications save failed", e);
    }

    return { prizeId: prize.id, label: prize.label, detail: prize.detail, couponCode, alreadyWon: false };
  });
