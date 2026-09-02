// Server-only: the newsletter popup's "spin the wheel" signup discount —
// separate from wheel.functions.ts (the booking-confirmation wheel).
// Subscribes the email to the newsletter AND spins, in one call, since the
// two are the same action here (checking the opt-in checkbox at signup).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveNewsletterWheelSpin, findNewsletterWheelPrize } from "@/lib/newsletter-wheel-prizes";

type SpinResult = { sequenceIds: string[]; couponCode: string | null; alreadySpun: boolean };

/** Real, single-use coupon — same minting pattern as wheel.functions.ts's mintWheelCoupon, distinct code prefix (NL vs WHEEL) so an admin can tell which flow granted it. */
async function mintNewsletterCoupon(supabaseAdmin: any, percent: number, email: string): Promise<string | null> {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const code = `NL${percent}-${suffix}`;
  const { data, error } = await supabaseAdmin
    .from("coupons")
    .insert({ code, discount_percent: percent, discount_amount: 0, active: true, single_use: true, issued_to_email: email })
    .select("code")
    .single();
  if (error) {
    console.error("[SWEETBABY] newsletter wheel coupon mint failed", error);
    return null;
  }
  return data?.code ?? null;
}

export const spinNewsletterWheel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email().max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<SpinResult> => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // newsletter_signups columns used here (wheel_prize_sequence/
    // wheel_coupon_code/wheel_spun_at) are very recent — cast past the
    // generated types until they're regenerated (same pattern used
    // elsewhere in this codebase for brand-new columns).
    const { data: existing } = await (supabaseAdmin as any)
      .from("newsletter_signups")
      .select("wheel_prize_sequence, wheel_coupon_code, wheel_spun_at")
      .eq("email", email)
      .maybeSingle();

    // Already spun (ever) — return the SAME result again, never a fresh
    // spin, so re-opening the popup (or resubmitting) can't grant a second
    // prize for the same email.
    if (existing?.wheel_spun_at) {
      return { sequenceIds: (existing.wheel_prize_sequence as string[] | null) ?? [], couponCode: existing.wheel_coupon_code ?? null, alreadySpun: true };
    }

    // Upsert the subscription row first (source distinguishes this from the
    // plain email-only footer/popup path in subscribeNewsletter).
    await (supabaseAdmin as any)
      .from("newsletter_signups")
      .upsert({ email, source: "popup_wheel" }, { onConflict: "email", ignoreDuplicates: false });

    const sequence = resolveNewsletterWheelSpin();
    const final = sequence[sequence.length - 1];

    let couponCode: string | null = null;
    if (final.kind === "discount") {
      couponCode = await mintNewsletterCoupon(supabaseAdmin, final.percent, email);
    } else if (final.kind === "credit") {
      const { error } = await supabaseAdmin.rpc("adjust_loyalty_credit", { p_user_id: context.userId, p_delta: final.amount, p_source: "manual" });
      if (error) console.error("[SWEETBABY] newsletter wheel credit grant failed", error);
    }

    const sequenceIds = sequence.map((p) => p.id);
    const { error: updErr } = await (supabaseAdmin as any)
      .from("newsletter_signups")
      .update({ wheel_prize_sequence: sequenceIds, wheel_coupon_code: couponCode, wheel_spun_at: new Date().toISOString() })
      .eq("email", email);
    if (updErr) console.error("[SWEETBABY] newsletter wheel save failed", updErr);

    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "newsletter_wheel_won",
        title: `🎡 זכייה בגלגל הרשמה · ${email} · ${final.label}`,
        body: { email, sequence: sequenceIds, coupon_code: couponCode },
      });
    } catch (e) {
      console.error("[SWEETBABY] newsletter wheel win admin_notifications save failed", e);
    }

    return { sequenceIds, couponCode, alreadySpun: false };
  });

/** Client-safe helper — resolves a sequence of ids back to prize objects for the wheel UI (findNewsletterWheelPrize is already pure/shared). */
export { findNewsletterWheelPrize };
