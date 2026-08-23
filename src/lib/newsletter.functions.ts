import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  email: z.string().min(3).max(200).email(),
  source: z.string().max(80).optional(),
});

type IssuedCoupon = { code: string; discount_percent: number; discount_amount: number };

// Mints (or reuses) a personal, single-use coupon for this email, cloned
// from whichever coupon is flagged "newsletter_default" in /admin/coupons.
// Reuses an existing unredeemed one instead of minting a new code every
// time the same email resubmits the form.
async function issuePersonalCoupon(supabaseAdmin: any, email: string): Promise<IssuedCoupon | null> {
  const { data: existing } = await supabaseAdmin
    .from("coupons")
    .select("code, discount_percent, discount_amount")
    .eq("issued_to_email", email)
    .eq("single_use", true)
    .eq("active", true)
    .is("redeemed_at", null)
    .maybeSingle();
  if (existing) return existing as IssuedCoupon;

  const { data: template } = await supabaseAdmin
    .from("coupons")
    .select("code, discount_percent, discount_amount")
    .eq("newsletter_default", true)
    .eq("active", true)
    .maybeSingle();
  if (!template) return null;

  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const code = `${template.code}-${suffix}`;
  const { data: minted, error } = await supabaseAdmin
    .from("coupons")
    .insert({
      code,
      discount_percent: template.discount_percent,
      discount_amount: template.discount_amount,
      active: true,
      single_use: true,
      issued_to_email: email,
    })
    .select("code, discount_percent, discount_amount")
    .single();
  if (error) return null;
  return minted as IssuedCoupon;
}

// Public lead-capture endpoint (no auth) — backs the "get 15% off" email
// signup in the footer/popup. Writes go through the service-role client so
// newsletter_signups needs no anon insert policy (see its migration).
export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("newsletter_signups")
      .upsert({ email, source: data.source ?? null }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw new Error("ההרשמה נכשלה, נסי שוב");

    const coupon = await issuePersonalCoupon(supabaseAdmin, email);
    return { ok: true, coupon };
  });
