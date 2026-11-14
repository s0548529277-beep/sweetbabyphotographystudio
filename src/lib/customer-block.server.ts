/**
 * Admin-blocked customers (customer_loyalty.blocked). A blocked customer cannot place prop orders or
 * studio bookings — by site account, by a second account with the same phone, or by phone call/bot.
 * The customer only ever sees a generic "technical problem" message (owner request 2026-11-14).
 */
export const BLOCKED_MESSAGE = "יש תקלה כרגע, נסו שוב מאוחר יותר.";

const last9 = (p: string | null | undefined) => String(p ?? "").replace(/\D/g, "").slice(-9);

export async function isBlockedCustomer(opts: { userId?: string | null; phone?: string | null }): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blocked } = await supabaseAdmin.from("customer_loyalty").select("user_id").eq("blocked", true);
    const ids = (blocked ?? []).map((r: any) => r.user_id as string);
    if (!ids.length) return false;
    if (opts.userId && ids.includes(opts.userId)) return true;
    const phones = new Set<string>();
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, phone").in("id", ids);
    for (const p of profs ?? []) if (last9((p as any).phone).length === 9) phones.add(last9((p as any).phone));
    if (!phones.size) return false;
    if (last9(opts.phone).length === 9 && phones.has(last9(opts.phone))) return true;
    if (opts.userId) {
      const { data: me } = await supabaseAdmin.from("profiles").select("phone").eq("id", opts.userId).maybeSingle();
      if (last9((me as any)?.phone).length === 9 && phones.has(last9((me as any).phone))) return true;
    }
    return false;
  } catch (e) {
    console.error("[SWEETBABY] blocked-customer check failed (not blocking)", e);
    return false;
  }
}

export async function assertNotBlocked(opts: { userId?: string | null; phone?: string | null }) {
  if (await isBlockedCustomer(opts)) throw new Error(BLOCKED_MESSAGE);
}
