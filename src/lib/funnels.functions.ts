// Server functions for the lead funnels (see funnels.ts for the questions and scoring).
//  - getFunnelSettings: public, which funnels are switched on (app_settings key `funnels_enabled`, default all on)
//  - setFunnelSettings: admin only, the on/off switches in /admin/funnel-leads
//  - submitFunnelLead: public, saves a finished funnel as a lead (score + recommendation recomputed HERE), emails
//    the owner with the browsing history, ties the visitor id to the details she left
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_FUNNEL_SETTINGS,
  FUNNEL_LABELS,
  LEAD_FUNNELS,
  answerLines,
  evaluateFunnel,
  parseFunnelSettings,
  validateAnswers,
  type FunnelSettings,
  type LeadFunnelId,
} from "@/lib/funnels";

const SETTINGS_KEY = "funnels_enabled";
const NOTIFY_TO = "m0548529277@gmail.com";
const SITE = "https://sweetbabyphoto.shop";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

export const getFunnelSettings = createServerFn({ method: "GET" }).handler(async (): Promise<FunnelSettings> => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    return parseFunnelSettings(data?.value);
  } catch {
    return { ...DEFAULT_FUNNEL_SETTINGS };
  }
});

export const setFunnelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entry: z.boolean(), studio: z.boolean(), photography: z.boolean(), newborn: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert({ key: SETTINGS_KEY, value: JSON.stringify(data), updated_at: new Date().toISOString() });
    if (error) throw new Error("השמירה נכשלה");
    return { ok: true };
  });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SubmitInput = z.object({
  funnel: z.enum(["studio", "photography", "newborn"]),
  answers: z.record(z.string().max(40)),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  sourcePage: z.string().max(300).optional(),
  utm: z.record(z.string().max(200)).optional(),
  /** Honeypot: real visitors never fill this. */
  website: z.string().max(200).optional(),
});

export const submitFunnelLead = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data }) => {
    if (data.website) return { ok: true }; // bot
    const funnel = data.funnel as LeadFunnelId;
    if (!LEAD_FUNNELS.includes(funnel) || !validateAnswers(funnel, data.answers)) throw new Error("התשובות לא תקינות");
    const digits = data.phone.replace(/\D/g, "");
    if (digits.length < 8) throw new Error("מספר הטלפון אינו תקין");
    const result = evaluateFunnel(funnel, data.answers);
    const email = data.email || "";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await (supabaseAdmin as any)
      .from("funnel_leads")
      .insert({
        funnel,
        name: data.name,
        phone: data.phone,
        email: email || null,
        answers: data.answers,
        recommendation: result.recommendation,
        score: result.score,
        is_hot: result.hot,
        source_page: data.sourcePage ?? null,
        utm: data.utm ?? {},
      })
      .select("id")
      .single();
    if (error) {
      console.error("[SWEETBABY] funnel lead save failed", error);
      throw new Error("שמירת הפרטים נכשלה");
    }

    // Tie the visitor id (only sent after the cookie banner was accepted) to these details, and add the history to the mail.
    let journeyHtml = "";
    try {
      const { linkVisitorFromRequest, journeyEmailBlock } = await import("@/lib/visitor-tracking.server");
      await linkVisitorFromRequest({ kind: "funnel", refId: String(saved?.id ?? ""), name: data.name, phone: data.phone, email });
      journeyHtml = await journeyEmailBlock();
    } catch (e) {
      console.error("[SWEETBABY] funnel visitor link failed", e);
    }

    try {
      const { sendGmail } = await import("@/integrations/google/gmail.server");
      const local = digits.startsWith("0") ? "972" + digits.slice(1) : digits.startsWith("972") ? digits : "972" + digits;
      const wa = `https://wa.me/${local}?text=${encodeURIComponent(`היי ${data.name}, כאן הסטודיו של מיכל סיבוני 🤍 ראיתי שמילאת שאלון באתר, אשמח לעזור!`)}`;
      const rows = answerLines(funnel, data.answers)
        .map((r) => `<tr><td style="padding:6px 10px;color:#8a7466">${esc(r.q)}</td><td style="padding:6px 10px">${esc(r.a)}</td></tr>`)
        .join("");
      const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#4a3a30;max-width:600px;margin:auto;background:#faf6f1;padding:24px;border-radius:14px">
        <h2 style="margin:0 0 4px">${result.hot ? "🔥 ליד חם" : "ליד חדש"} · ${esc(FUNNEL_LABELS[funnel])}</h2>
        <p style="margin:0 0 14px;color:#8a7466">ניקוד ${result.score}${result.hot ? " (ליד חם)" : ""}${data.sourcePage ? ` · מדף ${esc(data.sourcePage)}` : ""}</p>
        <table style="border-collapse:collapse;width:100%;background:#fff;border-radius:10px">
          <tr><td style="padding:6px 10px;color:#8a7466">שם</td><td style="padding:6px 10px">${esc(data.name)}</td></tr>
          <tr><td style="padding:6px 10px;color:#8a7466">טלפון</td><td style="padding:6px 10px" dir="ltr">${esc(data.phone)}</td></tr>
          <tr><td style="padding:6px 10px;color:#8a7466">מייל</td><td style="padding:6px 10px">${esc(email || "—")}</td></tr>
          ${rows}
          <tr><td style="padding:6px 10px;color:#8a7466">המלצה</td><td style="padding:6px 10px"><b>${esc(result.headline)}</b><br>${esc(result.recommendation)}</td></tr>
        </table>
        ${journeyHtml}
        <p style="text-align:center;margin:20px 0 6px"><a href="${wa}" style="background:#25d366;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;display:inline-block">שליחת וואטסאפ אל ${esc(data.name)}</a></p>
        <p style="text-align:center;font-size:12px;color:#8a7466">לא נשלחה שום הודעה אוטומטית ללידה. כל הלידים: ${SITE}/admin/funnel-leads</p>
      </div>`;
      await sendGmail({
        to: NOTIFY_TO,
        subject: `${result.hot ? "🔥 ליד חם" : "ליד חדש"} · ${FUNNEL_LABELS[funnel]} · ${data.name}`,
        html,
        fromName: "Sweetbaby · לידים",
      });
    } catch (e) {
      console.error("[SWEETBABY] funnel lead email failed", e);
    }
    return { ok: true };
  });
