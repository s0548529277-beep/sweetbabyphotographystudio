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

function discountLine(coupon: IssuedCoupon): string {
  const parts: string[] = [];
  if (Number(coupon.discount_percent) > 0) parts.push(`${coupon.discount_percent}% הנחה`);
  if (Number(coupon.discount_amount) > 0) parts.push(`₪${coupon.discount_amount} הנחה`);
  return parts.join(" + ") || "הנחה";
}

/** Welcome email to the new subscriber (+ a copy to the studio) — congratulations, and her personal one-time code if one was issued. */
async function sendWelcomeEmail(email: string, coupon: IssuedCoupon | null) {
  const codeBlock = coupon
    ? `<div style="background:#faf2ee;border-radius:14px;padding:18px 22px;margin:18px 0;text-align:center">
         <div style="font-size:13px;color:#6b5b53;margin-bottom:6px">קוד ההנחה האישי שלך</div>
         <div style="font-size:28px;font-weight:700;letter-spacing:2px;color:#2d3d2b">${coupon.code}</div>
         <div style="font-size:13px;color:#6b5b53;margin-top:6px">${discountLine(coupon)} · קוד חד-פעמי — כדאי לנצל אותו בהזמנה הראשונה שלך! 🎁</div>
       </div>`
    : "";
  const html = `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:520px;margin:0 auto">
    <h2>ברוכה הבאה למשפחת Sweetbaby! 💗</h2>
    <p>שמחות שהצטרפת לניוזלטר שלנו — עדכונים, מבצעים והשראה לצילומים ישירות אלייך.</p>
    ${codeBlock}
    <p style="font-size:13px;color:#6b5b53">אפשר להשתמש בקוד בהשכרת סטודיו או בהשכרת אביזרים, בעמוד התשלום.</p>
  </div>`;
  try {
    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
    await sendStudioAndCustomer({ customerEmail: email, subject: "ברוכה הבאה ל-Sweetbaby 💗 + קוד הנחה אישי", html });
  } catch (e) {
    console.error("[SWEETBABY] newsletter welcome email failed", e);
  }
}

// Public lead-capture endpoint (no auth) — backs the "get 15% off" email
// signup in the footer/popup. Writes go through the service-role client so
// newsletter_signups needs no anon insert policy (see its migration).
export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upserted, error } = await supabaseAdmin
      .from("newsletter_signups")
      .upsert({ email, source: data.source ?? null }, { onConflict: "email", ignoreDuplicates: true })
      .select("email");
    if (error) throw new Error("ההרשמה נכשלה, נסי שוב");

    const coupon = await issuePersonalCoupon(supabaseAdmin, email);
    // ignoreDuplicates means an already-subscribed email returns no row —
    // only send the welcome email for a genuinely new signup, not every
    // resubmit of the same address.
    if (upserted && upserted.length > 0) await sendWelcomeEmail(email, coupon);
    return { ok: true, coupon };
  });
