import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

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

// Lets the popup/footer form skip already-subscribed visitors (e.g. a
// logged-in customer who joined before) instead of pitching them again.
export const isNewsletterSubscribed = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: z.string().min(3).max(200).email() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin
        .from("newsletter_signups")
        .select("email")
        .eq("email", data.email.trim().toLowerCase())
        .maybeSingle();
      return { subscribed: !!row };
    } catch (e) {
      console.error("[SWEETBABY] newsletter subscription check failed", e);
      return { subscribed: false };
    }
  });

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

// One-click "gather every email address that ever came through the site"
// for /admin/newsletter — per explicit request. Scans every place a real
// (not vendor/internal) email address is collected: registered accounts
// (auth.users — same paginated listUsers pattern as listClientEmails in
// admin-clients.functions.ts), the old intake/contact form (leads), the
// pre-self-serve club signup (subscription_requests), the waitlist, and
// the two admin-entered lead trackers (newborn/outdoor package orders).
// Deliberately excludes expenses.vendor_email (a supplier, not a client)
// and retouch_allowed_clients.email (an admin-curated access allowlist for
// other photographers, not an inbound site signup). Idempotent — safe to
// run again later as new clients come in; newsletter_signups.email is
// UNIQUE, and ignoreDuplicates on the upsert skips anyone already there
// (including the ones it added last time).
const IMPORT_SOURCE = {
  account: "חשבון רשום באתר",
  lead: "טופס יצירת קשר",
  subscriptionRequest: "בקשת הצטרפות למועדון",
  newborn: "לקוחת ניו-בורן",
  outdoor: "לקוחת צילומי חוץ",
  waitlist: "רשימת המתנה",
} as const;

export const importSiteEmailsToNewsletter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const collected = new Map<string, string>(); // lowercased email -> source label
    const add = (raw: string | null | undefined, source: string) => {
      const email = raw?.trim().toLowerCase();
      if (!email || !email.includes("@")) return;
      if (!collected.has(email)) collected.set(email, source);
    };

    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of data.users) add(u.email, IMPORT_SOURCE.account);
      if (data.users.length < 200) break;
    }

    const [leads, subReqs, newborn, outdoor, waitlist] = await Promise.all([
      supabaseAdmin.from("leads").select("email"),
      supabaseAdmin.from("subscription_requests").select("email"),
      (supabaseAdmin as any).from("newborn_package_orders").select("contact_email"),
      (supabaseAdmin as any).from("outdoor_package_orders").select("contact_email"),
      supabaseAdmin.from("waitlist_entries").select("email"),
    ]);
    (leads.data ?? []).forEach((r: any) => add(r.email, IMPORT_SOURCE.lead));
    (subReqs.data ?? []).forEach((r: any) => add(r.email, IMPORT_SOURCE.subscriptionRequest));
    (newborn.data ?? []).forEach((r: any) => add(r.contact_email, IMPORT_SOURCE.newborn));
    (outdoor.data ?? []).forEach((r: any) => add(r.contact_email, IMPORT_SOURCE.outdoor));
    (waitlist.data ?? []).forEach((r: any) => add(r.email, IMPORT_SOURCE.waitlist));

    const { data: existing } = await supabaseAdmin.from("newsletter_signups").select("email");
    const already = new Set((existing ?? []).map((r: any) => String(r.email).toLowerCase()));
    const toInsert = Array.from(collected.entries())
      .filter(([email]) => !already.has(email))
      .map(([email, source]) => ({ email, source }));

    let added = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { data: inserted, error } = await supabaseAdmin
        .from("newsletter_signups")
        .upsert(chunk, { onConflict: "email", ignoreDuplicates: true })
        .select("email");
      if (error) throw new Error(error.message);
      added += inserted?.length ?? 0;
    }

    return { scanned: collected.size, added };
  });

// Generic "paste a list, get emails into the newsletter" tool — for leads
// that live somewhere this app's own database can't reach (e.g. an old
// website's contact-form notification emails, manually reviewed and
// transcribed). Accepts plain text, one lead per line, pipe-separated:
// name|phone|email|reason — only email is required, the rest are ignored
// here (newsletter_signups has no columns for them) but tolerated so the
// same pasted block used elsewhere (e.g. a spreadsheet export) can be
// pasted as-is. Same idempotent upsert/ignoreDuplicates pattern as
// importSiteEmailsToNewsletter above.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export const importPastedLeadsToNewsletter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().max(200000), source: z.string().max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const source = data.source?.trim() || "ייבוא ידני";
    const collected = new Map<string, string>();
    for (const line of data.text.split("\n")) {
      const match = line.match(EMAIL_RE);
      if (!match) continue;
      const email = match[0].trim().toLowerCase();
      if (!collected.has(email)) collected.set(email, source);
    }

    const { data: existing } = await supabaseAdmin.from("newsletter_signups").select("email");
    const already = new Set((existing ?? []).map((r: any) => String(r.email).toLowerCase()));
    const toInsert = Array.from(collected.entries())
      .filter(([email]) => !already.has(email))
      .map(([email, src]) => ({ email, source: src }));

    let added = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { data: inserted, error } = await supabaseAdmin
        .from("newsletter_signups")
        .upsert(chunk, { onConflict: "email", ignoreDuplicates: true })
        .select("email");
      if (error) throw new Error(error.message);
      added += inserted?.length ?? 0;
    }

    return { scanned: collected.size, added };
  });
