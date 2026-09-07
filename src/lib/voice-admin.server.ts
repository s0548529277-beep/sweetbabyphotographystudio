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

/** Personalized greeting name for a specific admin number — checked before the generic profiles-table lookup (personalizedGreeting in voice-caller.server.ts). Only numbers that should get this treatment need an entry here; others still fall through to the normal recognized-customer greeting. */
export const ADMIN_VOICE_CALLER_NAMES: Record<string, string> = {
  "0548529277": "מיכל סיבוני",
};

/** Matches callerPhone against ADMIN_VOICE_CALLER_NAMES, robust to the same +972/leading-0 formatting differences lastDigits already handles elsewhere. */
export function adminVoiceCallerName(callerPhone: string): string | null {
  const digits = lastDigits(callerPhone);
  if (digits.length < 6) return null;
  for (const [phone, name] of Object.entries(ADMIN_VOICE_CALLER_NAMES)) {
    if (lastDigits(phone) === digits) return name;
  }
  return null;
}

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

export type AdminCustomerMatch = {
  source: "booking" | "order" | "newborn_order";
  name: string | null;
  phone: string | null;
  email: string | null;
  date: string | null;
  status: string | null;
};

/**
 * Looks up a customer's contact info (name/phone/email) by name or phone
 * across bookings, accessory orders, and newborn-package orders — for the
 * studio owner only (same PIN-gated admin tool family as
 * getAdminVoiceSnapshot). Added after a direct report: the owner asked the
 * voice bot for a specific customer's phone number, urgently, and it had no
 * way to answer — getAdminVoiceSnapshot's own summary deliberately never
 * selects contact_phone/contact_email at all (see its doc comment: reading
 * out exhaustive customer data by default was a deliberate choice to avoid),
 * and no other tool existed to look up ONE specific customer on request.
 * This one is opt-in per call (she has to actually ask for a name/phone),
 * not part of the standing snapshot, so it doesn't change that earlier
 * privacy tradeoff — it just closes the real gap where even the legitimate
 * owner, PIN-verified, couldn't get an answer that's sitting right in the
 * database.
 *
 * `query` is matched two ways: as a name substring (ILIKE) and as a phone
 * number (digits-only substring match against contact_phone) — so "רותי" or
 * "0521234567" both work without the caller having to specify which. Email
 * is only ever available for bookings/orders tied to a real logged-in
 * account (via profiles) — accessory/studio guest checkouts never collect
 * email at all, only name+phone (see checkout.tsx/orders.functions.ts) — so
 * a null email here is often expected, not a bug.
 */
export async function lookupAdminCustomerContact(query: string): Promise<AdminCustomerMatch[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const q = query.trim();
  if (!q) return [];
  const digits = q.replace(/\D/g, "");
  const hasPhoneQuery = digits.length >= 4;

  // Two separate plain `.ilike()` queries per table (name, and — only when
  // the query has enough digits to be a real phone fragment — phone)
  // instead of building a single raw PostgREST `.or(...)` filter string
  // from spoken user input, where a name containing a comma/dot/percent
  // would corrupt that filter's own syntax.
  const bookingsCols = "contact_name, contact_phone, session_date, status, user_id";
  const ordersCols = "contact_name, contact_phone, session_date, status, user_id";
  const newbornCols = "contact_name, contact_phone, contact_email, session_date";
  const noRows = Promise.resolve({ data: [] as any[] });

  const [
    bookingsByName, bookingsByPhone,
    ordersByName, ordersByPhone,
    newbornByName, newbornByPhone,
  ] = await Promise.all([
    supabaseAdmin.from("bookings").select(bookingsCols).ilike("contact_name", `%${q}%`).order("created_at", { ascending: false }).limit(5),
    hasPhoneQuery
      ? supabaseAdmin.from("bookings").select(bookingsCols).ilike("contact_phone", `%${digits}%`).order("created_at", { ascending: false }).limit(5)
      : noRows,
    supabaseAdmin.from("orders").select(ordersCols).ilike("contact_name", `%${q}%`).order("created_at", { ascending: false }).limit(5),
    hasPhoneQuery
      ? supabaseAdmin.from("orders").select(ordersCols).ilike("contact_phone", `%${digits}%`).order("created_at", { ascending: false }).limit(5)
      : noRows,
    // No status column on newborn_package_orders (it tracks an 8-step
    // timestamp pipeline instead, see its own migration) — status stays
    // null for these rows below. Cast past the generated types, same as
    // newborn-orders.functions.ts does — this is a very recent table not
    // yet in the regenerated Supabase types.
    (supabaseAdmin as any).from("newborn_package_orders").select(newbornCols).ilike("contact_name", `%${q}%`).order("created_at", { ascending: false }).limit(5),
    hasPhoneQuery
      ? (supabaseAdmin as any).from("newborn_package_orders").select(newbornCols).ilike("contact_phone", `%${digits}%`).order("created_at", { ascending: false }).limit(5)
      : noRows,
  ]);
  const bookingsRes = { data: [...(bookingsByName.data ?? []), ...(bookingsByPhone.data ?? [])] };
  const ordersRes = { data: [...(ordersByName.data ?? []), ...(ordersByPhone.data ?? [])] };
  const newbornRes = { data: [...(newbornByName.data ?? []), ...(newbornByPhone.data ?? [])] };

  // Best-effort: resolve email for the bookings/orders rows that came from
  // a real account (guest checkouts have no user_id at all). Email lives in
  // auth.users, not the public profiles table (which has no email column at
  // all — see admin-site-bot.functions.ts's own note on this) — same
  // supabaseAdmin.auth.admin.getUserById lookup already used elsewhere in
  // this codebase (orders.functions.ts, bookings.functions.ts) for exactly
  // this reason.
  const userIds = Array.from(
    new Set([...(bookingsRes.data ?? []), ...(ordersRes.data ?? [])].map((r: any) => r.user_id).filter(Boolean)),
  ) as string[];
  const emailByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const results = await Promise.all(userIds.map((id) => supabaseAdmin.auth.admin.getUserById(id)));
    userIds.forEach((id, i) => {
      const email = results[i]?.data?.user?.email;
      if (email) emailByUserId.set(id, email);
    });
  }

  const results: AdminCustomerMatch[] = [
    ...(bookingsRes.data ?? []).map((b: any) => ({
      source: "booking" as const,
      name: b.contact_name,
      phone: b.contact_phone,
      email: b.user_id ? emailByUserId.get(b.user_id) ?? null : null,
      date: b.session_date,
      status: b.status,
    })),
    ...(ordersRes.data ?? []).map((o: any) => ({
      source: "order" as const,
      name: o.contact_name,
      phone: o.contact_phone,
      email: o.user_id ? emailByUserId.get(o.user_id) ?? null : null,
      date: o.session_date,
      status: o.status,
    })),
    ...(newbornRes.data ?? []).map((n: any) => ({
      source: "newborn_order" as const,
      name: n.contact_name,
      phone: n.contact_phone,
      email: n.contact_email ?? null,
      date: n.session_date,
      status: null,
    })),
  ];

  // De-dupe identical name+phone pairs across sources (the same customer
  // often has both a booking AND an accessory order) — keep the first
  // (most recent, each source already ordered desc) occurrence.
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.name ?? ""}|${r.phone ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
