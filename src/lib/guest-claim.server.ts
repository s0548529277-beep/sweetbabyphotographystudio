// Server-only helpers for the guest "quick registration" link in order / booking mails.
// A guest (Supabase anonymous session) has no way back into her account; the mail carries a signed link
// (HMAC of kind + id) to /claim/<kind>/<id>?t=<token>, where she registers and her orders + credit move to the new account.

async function hmacHex(message: string): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("missing signing secret");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(`guest-claim:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ClaimKind = "booking" | "order";

export async function guestClaimToken(kind: ClaimKind, id: string): Promise<string> {
  return (await hmacHex(`${kind}:${id}`)).slice(0, 40);
}

export async function verifyGuestClaimToken(kind: ClaimKind, id: string, token: string): Promise<boolean> {
  if (!token || token.length !== 40) return false;
  const expected = await guestClaimToken(kind, id);
  let diff = 0;
  for (let i = 0; i < 40; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** True when this auth user is a guest (anonymous session) — i.e. has no real account to come back to. */
export async function isGuestUser(userId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const u = data?.user;
    if (!u) return false;
    return !!(u as any).is_anonymous;
  } catch {
    return false;
  }
}

/**
 * HTML block for the order / booking mail — empty unless the order belongs to a guest.
 * `total` is the order total; the credit shown is the standard 10% cashback (same rate as the rest of the site).
 */
export async function guestSignupBlock(userId: string, kind: ClaimKind, id: string, total: number): Promise<string> {
  try {
    if (!(await isGuestUser(userId))) return "";
    const { buildGuestSignupHtml } = await import("@/lib/orderSummary");
    const token = await guestClaimToken(kind, id);
    const credit = total >= 100 ? Math.round(total * 0.1) : 0;
    return buildGuestSignupHtml(`https://sweetbabyphoto.shop/claim/${kind}/${id}?t=${token}`, credit);
  } catch (e) {
    console.error("[SWEETBABY] guest signup block failed", e);
    return "";
  }
}
