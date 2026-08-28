// Server-only availability helpers shared by AI tools and server functions.
import catalogData from "@/data/studio-catalog.json";

type CatItem = { sku: string; name: string; alt: string; price: number };
type Cat = { title: string; items: CatItem[] };

export const CATALOG_ITEMS: CatItem[] = (catalogData as Cat[]).flatMap((c) => c.items);

// A brand-new booking with nothing submitted toward the deposit yet holds
// its slot for this long before being treated as abandoned. Long enough
// that a customer mid-checkout never loses her own slot; short enough that
// someone who opens the page, requests a slot, and never comes back to pay
// doesn't block it forever. Once she submits a receipt or the deposit is
// confirmed, the hold no longer depends on time at all — see bookingBlocksSlot.
export const PENDING_HOLD_MINUTES = 60;

// Props orders don't require prepayment the way a studio booking's deposit
// does, so an untouched one is held for a shorter window before it's
// treated as abandoned.
export const PROPS_HOLD_MINUTES = 30;

/**
 * Whether a booking/order should count as occupying its slot right now.
 * Cancelled ones never block. An untouched pending-deposit/payment hold
 * (nothing submitted, i.e. deposit_status still literally "pending") stops
 * blocking once it's older than `holdMinutes` — anything beyond that (a
 * receipt submitted, cash marked pending, deposit confirmed) blocks
 * regardless of age, since the customer already took her half of the action.
 * Shared by every place that decides whether a slot/item is free — the
 * chat's check_studio_availability, the public /booking calendar,
 * placeBooking's own overlap check, and propsAvailability/order locking —
 * so they can never disagree with each other again.
 */
export function bookingBlocksSlot(
  b: { status: string; deposit_status?: string | null; created_at?: string | null },
  nowMs: number = Date.now(),
  holdMinutes: number = PENDING_HOLD_MINUTES,
): boolean {
  if (b.status === "cancelled") return false;
  if (b.deposit_status === "pending" && b.created_at) {
    const ageMinutes = (nowMs - new Date(b.created_at).getTime()) / 60000;
    if (ageMinutes > holdMinutes) return false;
  }
  return true;
}

/** Loads {status, deposit_status, created_at} for a set of order/booking ids, keyed by id — used to resolve who "owns" an item_availability row. */
async function loadOwners(supabaseAdmin: any, table: "orders" | "bookings", ids: string[]) {
  const map = new Map<string, { status: string; deposit_status?: string | null; created_at?: string | null }>();
  if (ids.length === 0) return map;
  const { data } = await supabaseAdmin.from(table).select("id, status, deposit_status, created_at").in("id", ids);
  for (const row of data ?? []) map.set(row.id, row);
  return map;
}

/**
 * Deletes item_availability rows (within the given items/date range) whose
 * owning order/booking is an abandoned, untouched pending hold older than
 * its hold window (PROPS_HOLD_MINUTES for a props order, PENDING_HOLD_MINUTES
 * for a studio booking's reserved items) — freeing the slot immediately for
 * a new order/booking instead of leaving it locked behind a hold nobody
 * ever paid or cancelled. Call this right before attempting to lock new
 * slots for the same items/range. Best-effort: never throws, since this is
 * proactive cleanup ahead of a real lock attempt, not something that should
 * block the request if it fails.
 */
export async function releaseAbandonedItemLocks(itemIds: string[], from: string, to: string): Promise<void> {
  if (itemIds.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("item_availability")
      .select("id, order_id, booking_id")
      .in("item_id", itemIds)
      .lte("start_date", to)
      .gte("end_date", from);
    const candidates = (rows ?? []).filter((r: any) => r.order_id || r.booking_id);
    if (candidates.length === 0) return;

    const orderIds = Array.from(new Set(candidates.map((r: any) => r.order_id).filter(Boolean))) as string[];
    const bookingIds = Array.from(new Set(candidates.map((r: any) => r.booking_id).filter(Boolean))) as string[];
    const [ordersMap, bookingsMap] = await Promise.all([
      loadOwners(supabaseAdmin, "orders", orderIds),
      loadOwners(supabaseAdmin, "bookings", bookingIds),
    ]);

    const now = Date.now();
    const staleIds: string[] = [];
    for (const r of candidates as any[]) {
      const owner = r.order_id ? ordersMap.get(r.order_id) : bookingsMap.get(r.booking_id);
      if (!owner) continue; // shouldn't happen (FK-guaranteed) — leave it blocking to be safe
      const holdMinutes = r.order_id ? PROPS_HOLD_MINUTES : PENDING_HOLD_MINUTES;
      if (!bookingBlocksSlot(owner, now, holdMinutes)) staleIds.push(r.id);
    }
    if (staleIds.length > 0) {
      await supabaseAdmin.from("item_availability").delete().in("id", staleIds);
    }
  } catch (e) {
    console.error("[SWEETBABY] releaseAbandonedItemLocks failed", e);
  }
}

export function findSkusByText(query: string, limit = 8): CatItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const direct = CATALOG_ITEMS.filter((i) => i.sku === q);
  if (direct.length) return direct;
  return CATALOG_ITEMS.filter(
    (i) =>
      i.sku.includes(q) ||
      (i.name || "").toLowerCase().includes(q) ||
      (i.alt || "").toLowerCase().includes(q),
  ).slice(0, limit);
}

/** Real availability of props between two dates (inclusive). */
export async function propsAvailability(skus: string[], from: string, to: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const end = to >= from ? to : from;

  const itemsRes = await supabaseAdmin.from("items").select("id, sku, name, stock_quantity").in("sku", skus);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  const items = itemsRes.data ?? [];
  const realIds = items.map((i) => i.id);

  const busyById = new Map<string, number>();
  if (realIds.length > 0) {
    const avail = await supabaseAdmin
      .from("item_availability")
      .select("item_id, order_id, booking_id")
      .in("item_id", realIds)
      .lte("start_date", end)
      .gte("end_date", from);
    if (avail.error) throw new Error(avail.error.message);
    const rows = avail.data ?? [];

    // Same abandoned-hold rule as studio bookings: an item_availability row
    // only counts as actually busy if its owning order/booking still
    // "blocks" per bookingBlocksSlot (an untouched pending hold older than
    // its window is treated as freed, not real).
    const orderIds = Array.from(new Set(rows.map((r: any) => r.order_id).filter(Boolean))) as string[];
    const bookingIds = Array.from(new Set(rows.map((r: any) => r.booking_id).filter(Boolean))) as string[];
    const [ordersMap, bookingsMap] = await Promise.all([
      loadOwners(supabaseAdmin, "orders", orderIds),
      loadOwners(supabaseAdmin, "bookings", bookingIds),
    ]);
    const now = Date.now();
    for (const r of rows as any[]) {
      const owner = r.order_id ? ordersMap.get(r.order_id) : bookingsMap.get(r.booking_id);
      const holdMinutes = r.order_id ? PROPS_HOLD_MINUTES : PENDING_HOLD_MINUTES;
      if (owner && !bookingBlocksSlot(owner, now, holdMinutes)) continue;
      busyById.set(r.item_id, (busyById.get(r.item_id) ?? 0) + 1);
    }
  }

  return skus.map((sku) => {
    const it = items.find((i) => i.sku === sku);
    const catalog = CATALOG_ITEMS.find((c) => c.sku === sku);
    if (!it) return { sku, name: catalog?.name || catalog?.alt || "", known: false, available: 0 };
    const stock = Number(it.stock_quantity ?? 1);
    const taken = busyById.get(it.id) ?? 0;
    return {
      sku,
      name: it.name || catalog?.name || catalog?.alt || "",
      known: true,
      available: Math.max(0, stock - taken),
    };
  });
}

function slotsForDate(iso: string, closure?: { closed: boolean; open_time: string | null; close_time: string | null }) {
  const day = new Date(`${iso}T12:00:00`).getDay();
  let openMin = 8 * 60;
  let closeMin = 23 * 60;
  if (day === 5) closeMin = 15 * 60;
  if (day === 6) openMin = 20 * 60;
  if (closure) {
    if (closure.closed) return [] as string[];
    if (closure.open_time) { const [h, m] = closure.open_time.split(":").map(Number); openMin = h * 60 + m; }
    if (closure.close_time) { const [h, m] = closure.close_time.split(":").map(Number); closeMin = h * 60 + m; }
  }
  const out: string[] = [];
  for (let t = openMin; t < closeMin; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

type Closure = { closed: boolean; open_time: string | null; close_time: string | null };

/** Pure: which half-hour slots on a day are actually free, given its opening
 * hours (via closure) and already-known busy ranges. Shared by
 * studioAvailability (single day) and nextAvailableDays (a whole range) so
 * the "is this slot free" rule can never drift between them. */
function freeSlotsForDay(
  date: string,
  closure: Closure | undefined,
  busy: Array<[number, number]>,
  nowIsrael: { date: string; minutes: number },
): string[] {
  const all = slotsForDate(date, closure);
  if (all.length === 0) return [];
  const minMinute = date === nowIsrael.date ? nowIsrael.minutes : -1;
  return all.filter((slot) => {
    const [h, m] = slot.split(":").map(Number);
    const s = h * 60 + m;
    const e = s + 30;
    if (s <= minMinute) return false;
    return !busy.some(([bs, be]) => s < be && e > bs);
  });
}

/** Free studio half-hour slots for a given date, optionally around a wanted hour. */
export async function studioAvailability(date: string, wantedTime?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Closures and bookings are independent queries — run them together
  // instead of one-after-the-other, saving a full round-trip on every check
  // (the common "studio is open" case; a closed day now does one wasted
  // bookings query instead, which is cheap and rare).
  const [closuresRes, bookingsRes] = await Promise.all([
    supabaseAdmin.from("studio_closures").select("*").eq("date", date),
    supabaseAdmin
      .from("bookings")
      .select("start_time, end_time, status, deposit_status, created_at")
      .eq("session_date", date)
      .neq("status", "cancelled"),
  ]);
  const closure = (closuresRes.data ?? [])[0] as Closure | undefined;

  const all = slotsForDate(date, closure);
  if (all.length === 0) return { date, closed: true, freeSlots: [] as string[], wantedFree: false, source: "closure" as const };

  const now = Date.now();
  const busy: Array<[number, number]> = (bookingsRes.data ?? [])
    .filter((b: any) => bookingBlocksSlot(b, now))
    .map((b) => {
      const [bh, bm] = String(b.start_time).split(":").map(Number);
      const [eh, em] = String(b.end_time).split(":").map(Number);
      return [bh * 60 + bm, eh * 60 + em];
    });

  // Merge in the studio owner's real Google Calendar so manually-added events
  // (personal blocks, sessions booked over the phone) also count as busy.
  let calendarLinked = true;
  try {
    const { listGoogleCalendarBusy } = await import("@/integrations/google/calendar.server");
    const gbusy = await listGoogleCalendarBusy(date, date);
    for (const range of gbusy[date] ?? []) busy.push(range);
  } catch (e) {
    calendarLinked = false;
    console.error("[SWEETBABY] calendar read failed", e);
  }

  const freeSlots = freeSlotsForDay(date, closure, busy, israelNow());
  const wantedFree = wantedTime ? freeSlots.includes(wantedTime.slice(0, 5)) : false;
  return { date, closed: false, freeSlots, wantedFree, calendarLinked };
}

/**
 * Converts an Israel-local wall-clock date+time (e.g. "2026-08-30" +
 * "10:00" — exactly what session_date/start_time or a naive pickup_at
 * timestamp already store) into a real UTC epoch millisecond value —
 * correctly, across the DST boundary (Israel is UTC+2 in winter, UTC+3 in
 * summer, so a hardcoded "+03:00" offset is wrong roughly half the year).
 * Used by the TTLock integration, which needs real epoch timestamps, not a
 * timezone-aware ISO string (unlike the Google Calendar API, which takes a
 * separate timeZone field and does this conversion itself).
 */
export function israelLocalToUtcMs(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.slice(0, 5).split(":").map(Number);
  const naiveUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);

  // What offset is Asia/Jerusalem actually at, around that instant? (Good
  // enough approximation — the offset only changes exactly at the DST
  // transition moment itself, which this isn't trying to be precise to the
  // minute for.)
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(naiveUtcMs)).map((p) => [p.type, p.value]));
  const jerMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  const offsetMs = jerMs - naiveUtcMs;
  return naiveUtcMs - offsetMs;
}

/** Current date/time in Israel, as an ISO date plus minutes since midnight. */
export function israelNow(): { date: string; minutes: number; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const time = `${parts.hour}:${parts.minute}`;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    time,
  };
}

/**
 * Scans forward from a date and returns the next days with enough free time.
 *
 * Used to call studioAvailability() — itself 2-3 network round-trips,
 * including a Google Calendar read — once PER DAY SCANNED, sequentially, in
 * a loop (daysToScan defaults to 21 in ai-tools.server.ts's
 * find_next_available_days). That's up to ~60 sequential external round
 * trips just to answer "when are you next free?" — a slow, "heavy" way to
 * answer what should be a quick question. Fetches closures, bookings, and
 * calendar busy-times ONCE for the whole date range instead (3 calls total,
 * in parallel, regardless of how many days are scanned), then computes each
 * day's free slots locally with freeSlotsForDay — no network left in the loop.
 */
export async function nextAvailableDays(fromDate: string, hours = 1, daysToScan = 14, limit = 5) {
  const needed = Math.max(1, Math.round(hours * 2)); // consecutive half-hour slots
  const base = new Date(`${fromDate}T12:00:00`);
  const toDate = new Date(base.getTime() + (daysToScan - 1) * 86400000).toISOString().slice(0, 10);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [closuresRes, bookingsRes, calendarBusy] = await Promise.all([
    supabaseAdmin.from("studio_closures").select("*").gte("date", fromDate).lte("date", toDate),
    supabaseAdmin
      .from("bookings")
      .select("session_date, start_time, end_time, status, deposit_status, created_at")
      .gte("session_date", fromDate)
      .lte("session_date", toDate)
      .neq("status", "cancelled"),
    (async () => {
      try {
        const { listGoogleCalendarBusy } = await import("@/integrations/google/calendar.server");
        return await listGoogleCalendarBusy(fromDate, toDate);
      } catch (e) {
        console.error("[SWEETBABY] calendar read failed (nextAvailableDays)", e);
        return {} as Record<string, Array<[number, number]>>;
      }
    })(),
  ]);

  const closuresByDate = new Map<string, Closure>();
  for (const c of (closuresRes.data ?? []) as any[]) closuresByDate.set(c.date, c);

  const now = Date.now();
  const bookingsByDate = new Map<string, Array<[number, number]>>();
  for (const b of (bookingsRes.data ?? []) as any[]) {
    if (!bookingBlocksSlot(b, now)) continue;
    const [bh, bm] = String(b.start_time).split(":").map(Number);
    const [eh, em] = String(b.end_time).split(":").map(Number);
    const arr = bookingsByDate.get(b.session_date) ?? [];
    arr.push([bh * 60 + bm, eh * 60 + em]);
    bookingsByDate.set(b.session_date, arr);
  }

  const nowIsrael = israelNow();
  const out: Array<{ date: string; firstStart: string; freeSlots: number }> = [];
  for (let i = 0; i < daysToScan && out.length < limit; i++) {
    const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
    const busy = [...(bookingsByDate.get(d) ?? []), ...(calendarBusy[d] ?? [])];
    const freeSlots = freeSlotsForDay(d, closuresByDate.get(d), busy, nowIsrael);
    if (freeSlots.length === 0) continue;
    // find a run of `needed` consecutive slots
    let run = 1;
    let start: string | null = null;
    for (let j = 0; j < freeSlots.length; j++) {
      if (j > 0) {
        const prev = freeSlots[j - 1].split(":").map(Number);
        const cur = freeSlots[j].split(":").map(Number);
        run = cur[0] * 60 + cur[1] - (prev[0] * 60 + prev[1]) === 30 ? run + 1 : 1;
      }
      if (run >= needed) { start = freeSlots[j - needed + 1]; break; }
    }
    if (start) out.push({ date: d, firstStart: start, freeSlots: freeSlots.length });
  }
  return out;
}

