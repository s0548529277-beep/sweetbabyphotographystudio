// Server-only: gates two extra voice-only abilities — a live business
// snapshot, and remote-issuing a door passcode — behind a real two-factor
// check, not caller ID alone.
//
// Caller ID (ApiPhone/From) is trivially spoofable, and even without
// spoofing, anyone who borrows/finds/steals the owner's phone would pass a
// caller-ID-only check with zero further verification — a real risk for a
// feature that can open the studio's physical door. So: matching one of
// ADMIN_VOICE_PHONES only makes the extra tools *available* in that call's
// tool list; each one still requires the caller to also speak the correct
// ADMIN_VOICE_PIN before it does anything. This was a deliberate,
// explicitly-confirmed choice (asked via AskUserQuestion, phone+PIN chosen
// over phone-only) — don't relax it to phone-only without asking again.

function lastDigits(phone: string, n = 8): string {
  return phone.replace(/\D/g, "").slice(-n);
}

// Not treated as secret — these are the studio's own known numbers,
// already public/committed elsewhere in this codebase (the 054-8529277
// contact number appears throughout SYSTEM, arrival.ts, orderSummary.ts).
// Only ADMIN_VOICE_PIN below is the real secret, and it lives in an
// environment variable, never in source.
export const ADMIN_VOICE_PHONES = ["0583270184", "0548529277"];

/** True if this caller's number matches one of the studio's own admin numbers — necessary but NOT sufficient on its own (see file doc comment). */
export function isAdminVoiceCaller(callerPhone: string): boolean {
  const digits = lastDigits(callerPhone);
  if (digits.length < 6) return false;
  return ADMIN_VOICE_PHONES.some((p) => lastDigits(p) === digits);
}

/**
 * The real secret half of the check. Set ADMIN_VOICE_PIN in Lovable's
 * environment variables — never hardcode a real PIN in source, it would
 * sit in git history forever. Digits-only compare so it doesn't matter if
 * she says "two zero seven..." and it gets transcribed with spaces/dashes.
 * Fails closed (returns false) if the env var isn't set at all, so the
 * admin tools are inert-safe by default until explicitly configured.
 */
export function verifyAdminPin(spokenPin: string): boolean {
  const expected = process.env.ADMIN_VOICE_PIN;
  if (!expected) return false;
  const expectedDigits = expected.replace(/\D/g, "");
  const spokenDigits = spokenPin.replace(/\D/g, "");
  return expectedDigits.length > 0 && spokenDigits === expectedDigits;
}

export type AdminVoiceSnapshot = {
  todayBookings: Array<{ time: string; name: string | null; status: string }>;
  upcomingBookings: Array<{ date: string; time: string; name: string | null }>;
  recentOrders: Array<{ date: string; name: string | null; status: string }>;
  unreadNotifications: { count: number; sampleTitles: string[] };
};

/**
 * A bounded, voice-friendly "what's going on" briefing — deliberately NOT
 * a raw dump of every admin table (reading out exhaustive customer data
 * over a live phone call is its own exposure even to the legitimate
 * owner, and most of it wouldn't be useful spoken aloud anyway). Covers
 * what an owner checking in remotely actually wants to know: today's and
 * next few bookings, recent orders, and how many notifications are
 * waiting. Extend this — not a generic "give me everything" tool — if a
 * specific other data point turns out to matter here.
 */
export async function getAdminVoiceSnapshot(): Promise<AdminVoiceSnapshot> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);

  const [todayB, upcomingB, recentO, unreadN] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("start_time, contact_name, status")
      .eq("session_date", today)
      .neq("status", "cancelled")
      .order("start_time", { ascending: true }),
    supabaseAdmin
      .from("bookings")
      .select("session_date, start_time, contact_name")
      .gt("session_date", today)
      .neq("status", "cancelled")
      .order("session_date", { ascending: true })
      .limit(3),
    supabaseAdmin
      .from("orders")
      .select("session_date, contact_name, status")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5),
    supabaseAdmin.from("admin_notifications").select("title", { count: "exact" }).is("read_at", null).order("created_at", { ascending: false }).limit(3),
  ]);

  return {
    todayBookings: (todayB.data ?? []).map((b: any) => ({ time: String(b.start_time).slice(0, 5), name: b.contact_name, status: b.status })),
    upcomingBookings: (upcomingB.data ?? []).map((b: any) => ({ date: b.session_date, time: String(b.start_time).slice(0, 5), name: b.contact_name })),
    recentOrders: (recentO.data ?? []).map((o: any) => ({ date: o.session_date, name: o.contact_name, status: o.status })),
    unreadNotifications: { count: unreadN.count ?? 0, sampleTitles: (unreadN.data ?? []).map((n: any) => n.title) },
  };
}
