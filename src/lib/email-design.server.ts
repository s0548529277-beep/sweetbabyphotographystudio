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

/** Never throws: any failure returns the html as built. */
export async function applyStoredEmailDesign(html: string): Promise<string> {
  try {
    if (!html || !html.includes('data-mail="')) return html;
    return applyEmailDesignToHtml(html, await readEmailDesign());
  } catch {
    return html;
  }
}
