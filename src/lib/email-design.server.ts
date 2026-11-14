// Server side of the editable e-mail design (see email-design.ts): cached read of app_settings.email_design and the
// one-liner the Gmail senders call right before a mail is sent / saved as a draft.
import { EMAIL_DESIGN_KEY, DEFAULT_EMAIL_DESIGN, applyEmailDesignToHtml, sanitizeEmailDesign, type EmailDesign } from "./email-design";

let cache: { at: number; design: EmailDesign } | null = null;

export async function readEmailDesign(force = false): Promise<EmailDesign> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.design;
  let design: EmailDesign = DEFAULT_EMAIL_DESIGN;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("app_settings").select("value").eq("key", EMAIL_DESIGN_KEY).maybeSingle();
    if (data?.value) design = sanitizeEmailDesign(JSON.parse(data.value));
  } catch {
    /* no saved design -> defaults */
  }
  cache = { at: Date.now(), design };
  return design;
}

export function resetEmailDesignCache() {
  cache = null;
}

/**
 * Never throws: any failure returns the html as built.
 * Safety net (owner 2026-11-08: "every mail, every automatic reply must have Michal Siboni on top and the signature at
 * the bottom"): a mail that does not carry a shell marker is wrapped in the photographer shell (wordmark on top, colour
 * signature + buttons below) using the subject as its heading. Full HTML documents are left alone.
 */
/** Which shell an unmarked mail gets: photography topics (contracts, galleries, albums, newborn / outdoor / photo clients) = photographer, everything else (studio, props, bookings, leads, notices) = studio. */
export function unmarkedMailIsPhotographer(subject: string): boolean {
  return /חוזה|אלבום|גלריה|גלריית|ניו[\s-]?בורן|צילומי חוץ|בחירת תמונות|בחירה|תמונות|סל לידה|צילומים עם מיכל|שאלון|לקוחות צילום|הכנה ליום הצילומים/.test(subject);
}

export async function applyStoredEmailDesign(html: string, subject?: string): Promise<string> {
  try {
    if (!html) return html;
    if (!html.includes('data-mail="')) {
      if (/<html[\s>]/i.test(html)) return html;
      const { buildBrandedMailHtml, buildStudioMailHtml } = await import("./email-draft-design");
      const title = (subject ?? "").replace(/[\s\p{Extended_Pictographic}\uFE0F\u200D]+/gu, " ").replace(/·.*$/, "").trim() || "מיכל סיבוני";
      html = unmarkedMailIsPhotographer(subject ?? "") ? buildBrandedMailHtml({ title, innerHtml: html }) : buildStudioMailHtml({ title, innerHtml: html });
    }
    return applyEmailDesignToHtml(html, await readEmailDesign());
  } catch {
    return html;
  }
}
