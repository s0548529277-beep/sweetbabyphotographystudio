// Signed one-click links for the digest mail: /api/lead-status?id=<lead>&s=<status>&t=<token>.
// The token is an HMAC of lead id + status, so a link can only set the exact status it was made for.
import { LEAD_ACTIONS, LEAD_STATUS_KEYS } from "@/lib/lead-status";

const SITE = "https://sweetbabyphoto.shop";

async function hmacHex(message: string): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("missing signing secret");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(`lead-status:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function leadStatusToken(id: string, status: string): Promise<string> {
  return (await hmacHex(`${id}:${status}`)).slice(0, 40);
}

export async function verifyLeadStatusToken(id: string, status: string, token: string): Promise<boolean> {
  if (!(LEAD_STATUS_KEYS.includes(status) || (LEAD_ACTIONS as readonly string[]).includes(status)) || !token || token.length !== 40) return false;
  const expected = await leadStatusToken(id, status);
  let diff = 0;
  for (let i = 0; i < 40; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function leadStatusUrl(id: string, status: string): Promise<string> {
  const t = await leadStatusToken(id, status);
  return `${SITE}/api/lead-status?id=${encodeURIComponent(id)}&s=${encodeURIComponent(status)}&t=${t}`;
}

/**
 * The two buttons every lead mail carries instead of the WhatsApp link (owner request 2026-11-26):
 * "לא רלוונטי" (one click) and "שנה סטטוס" (opens the page with: remind me tomorrow / already a customer / in talk / answered).
 */
export async function leadStatusButtonsHtml(leadId: string): Promise<string> {
  const [irrelevant, menu] = await Promise.all([leadStatusUrl(leadId, "not_relevant"), leadStatusUrl(leadId, "menu")]);
  const base = "display:inline-block;margin:3px 0 3px 8px;padding:6px 16px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none";
  return `<div style="margin-top:8px"><a href="${irrelevant}" style="${base};background:#e7e5e4;color:#57534e">לא רלוונטי</a><a href="${menu}" style="${base};background:#2d3d2b;color:#fff">שנה סטטוס ›</a></div>`;
}

/** Marker in `inquiry_leads.notes` of a row opened only to carry the buttons: the digest must not list the row itself again. */
export const BUTTON_ROW_NOTE = "נוצר מהתראת ליד";

const digitsKey = (p: unknown) => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
};

/**
 * The id of the lead row of this person (matched by phone, then e-mail, among the last 120 days), or a new row marked with
 * BUTTON_ROW_NOTE. Best effort: returns null when nothing can be matched or created (the mail is then sent without buttons).
 */
export async function findOrCreateLeadId(
  db: any,
  c: { name?: string | null; phone?: string | null; email?: string | null; source: string; message?: string | null },
): Promise<string | null> {
  try {
    const pk = digitsKey(c.phone);
    const ek = String(c.email ?? "").trim().toLowerCase();
    if (!pk && !ek) return null;
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const { data } = await db.from("inquiry_leads").select("id, email, phone").gte("created_at", since).order("updated_at", { ascending: false }).limit(1000);
    const hit = (data ?? []).find((l: any) => (pk && digitsKey(l.phone) === pk) || (ek && String(l.email ?? "").trim().toLowerCase() === ek));
    if (hit) return hit.id as string;
    const { data: ins, error } = await db
      .from("inquiry_leads")
      .insert({
        name: c.name || null,
        phone: c.phone || null,
        email: ek || null,
        source: c.source,
        topic: "other",
        message: String(c.message ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null,
        status: "new",
        first_contact_at: new Date().toISOString(),
        notes: BUTTON_ROW_NOTE,
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return (ins?.id as string) ?? null;
  } catch (e) {
    console.error("[SWEETBABY] lead row for mail buttons failed", e);
    return null;
  }
}
