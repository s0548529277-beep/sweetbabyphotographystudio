// Server-only: recognizes a phone caller (Yemot or Twilio) against the
// site's own "personal area" accounts (profiles.phone), so the bot can
// greet a known customer by name and reference her upcoming booking
// instead of starting from zero every call. Best-effort throughout — a
// lookup failure or no-match just falls back to the plain, impersonal
// greeting/context, it never blocks or breaks the call.

function lastDigits(phone: string, n = 8): string {
  return phone.replace(/\D/g, "").slice(-n);
}

export type CallerProfile = {
  userId: string;
  name: string | null;
  email: string | null;
  /** Short Hebrew one-liner about her nearest upcoming booking/order, for the AI's context — null if she has none. */
  upcomingText: string | null;
};

/**
 * Matches the incoming call's phone number against profiles.phone by
 * comparing the last 8 digits — robust to the "+972" / leading "0" /
 * dashes formatting differences a phone number can show up in. profiles.phone
 * is free text (no normalized column to index), so this pre-filters with an
 * ILIKE on the last 6 digits and confirms the real match in JS.
 */
export async function lookupCallerProfile(callerPhone: string): Promise<CallerProfile | null> {
  const digits = lastDigits(callerPhone);
  if (digits.length < 6) return null; // too short a number to match reliably

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidates } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone")
      .ilike("phone", `%${digits.slice(-6)}%`);

    const match = (candidates ?? []).find((p: any) => lastDigits(String(p.phone ?? "")) === digits);
    if (!match) return null;

    const today = new Date().toISOString().slice(0, 10);
    const [{ data: booking }, { data: order }] = await Promise.all([
      supabaseAdmin
        .from("bookings")
        .select("session_date, start_time, end_time")
        .eq("user_id", match.id)
        .neq("status", "cancelled")
        .gte("session_date", today)
        .order("session_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("orders")
        .select("session_date, pickup_at")
        .eq("user_id", match.id)
        .neq("status", "cancelled")
        .gte("session_date", today)
        .order("session_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    let upcomingText: string | null = null;
    if (booking) {
      upcomingText = `יש לה הזמנת סטודיו קרובה: ${(booking as any).session_date} בשעה ${String((booking as any).start_time).slice(0, 5)}-${String((booking as any).end_time).slice(0, 5)}.`;
    } else if (order) {
      upcomingText = `יש לה הזמנת אביזרים קרובה, איסוף בתאריך ${(order as any).session_date}.`;
    }

    // profiles has no email column (see admin-site-bot's own schema notes —
    // email lives in the internal auth.users table). Fetched here via the
    // Auth Admin API (only reachable with the service-role client, exactly
    // what supabaseAdmin is) so a recognized returning caller never has to
    // spell her email out loud on the phone at all — see runVoiceTurn's use
    // of caller.email below.
    let email: string | null = null;
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(match.id as string);
      email = authUser?.user?.email ?? null;
    } catch (e) {
      console.error("[SWEETBABY] caller email lookup failed", e);
    }

    return { userId: match.id as string, name: ((match as any).full_name as string | null) || null, email, upcomingText };
  } catch (e) {
    console.error("[SWEETBABY] caller profile lookup failed", e);
    return null;
  }
}

/** Builds the very first thing the caller hears — personalized with her name up front when she's a recognized account, otherwise the plain greeting. */
export async function personalizedGreeting(greetingAndMenu: string, callerPhone: string): Promise<string> {
  const profile = await lookupCallerProfile(callerPhone);
  if (!profile?.name) return greetingAndMenu;
  return `שלום ${profile.name}! ${greetingAndMenu}`;
}
