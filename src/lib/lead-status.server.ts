// Signed one-click links for the digest mail: /api/lead-status?id=<lead>&s=<status>&t=<token>.
// The token is an HMAC of lead id + status, so a link can only set the exact status it was made for.
import { LEAD_STATUS_KEYS } from "@/lib/lead-status";

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
  if (!LEAD_STATUS_KEYS.includes(status) || !token || token.length !== 40) return false;
  const expected = await leadStatusToken(id, status);
  let diff = 0;
  for (let i = 0; i < 40; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function leadStatusUrl(id: string, status: string): Promise<string> {
  const t = await leadStatusToken(id, status);
  return `${SITE}/api/lead-status?id=${encodeURIComponent(id)}&s=${encodeURIComponent(status)}&t=${t}`;
}
