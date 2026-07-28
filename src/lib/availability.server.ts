// Server-only availability helpers shared by AI tools and server functions.
import catalogData from "@/data/studio-catalog.json";

type CatItem = { sku: string; name: string; alt: string; price: number };
type Cat = { title: string; items: CatItem[] };

export const CATALOG_ITEMS: CatItem[] = (catalogData as Cat[]).flatMap((c) => c.items);

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
      .select("item_id")
      .in("item_id", realIds)
      .lte("start_date", end)
      .gte("end_date", from);
    if (avail.error) throw new Error(avail.error.message);
    for (const r of avail.data ?? []) busyById.set(r.item_id, (busyById.get(r.item_id) ?? 0) + 1);
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

/** Free studio half-hour slots for a given date, optionally around a wanted hour. */
export async function studioAvailability(date: string, wantedTime?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const closuresRes = await supabaseAdmin.from("studio_closures").select("*").eq("date", date);
  const closure = (closuresRes.data ?? [])[0] as
    | { closed: boolean; open_time: string | null; close_time: string | null }
    | undefined;

  const all = slotsForDate(date, closure);
  if (all.length === 0) return { date, closed: true, freeSlots: [] as string[], wantedFree: false, source: "closure" as const };

  const bookingsRes = await supabaseAdmin
    .from("bookings")
    .select("start_time, end_time, status")
    .eq("session_date", date)
    .neq("status", "cancelled");
  const busy: Array<[number, number]> = (bookingsRes.data ?? []).map((b) => {
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

  // Never offer slots that already passed today (Israel time).
  const nowIsrael = israelNow();
  const minMinute = date === nowIsrael.date ? nowIsrael.minutes : -1;

  const isFree = (slot: string) => {
    const [h, m] = slot.split(":").map(Number);
    const s = h * 60 + m;
    const e = s + 30;
    if (s <= minMinute) return false;
    return !busy.some(([bs, be]) => s < be && e > bs);
  };

  const freeSlots = all.filter(isFree);
  const wantedFree = wantedTime ? freeSlots.includes(wantedTime.slice(0, 5)) : false;
  return { date, closed: false, freeSlots, wantedFree, calendarLinked };
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

/** Scans forward from a date and returns the next days with enough free time. */
export async function nextAvailableDays(fromDate: string, hours = 1, daysToScan = 14, limit = 5) {
  const needed = Math.max(1, Math.round(hours * 2)); // consecutive half-hour slots
  const out: Array<{ date: string; firstStart: string; freeSlots: number }> = [];
  const base = new Date(`${fromDate}T12:00:00`);
  for (let i = 0; i < daysToScan && out.length < limit; i++) {
    const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
    const res = await studioAvailability(d);
    if (res.closed || res.freeSlots.length === 0) continue;
    // find a run of `needed` consecutive slots
    let run = 1;
    let start: string | null = null;
    for (let j = 0; j < res.freeSlots.length; j++) {
      if (j > 0) {
        const prev = res.freeSlots[j - 1].split(":").map(Number);
        const cur = res.freeSlots[j].split(":").map(Number);
        run = cur[0] * 60 + cur[1] - (prev[0] * 60 + prev[1]) === 30 ? run + 1 : 1;
      }
      if (run >= needed) { start = res.freeSlots[j - needed + 1]; break; }
    }
    if (start) out.push({ date: d, firstStart: start, freeSlots: res.freeSlots.length });
  }
  return out;
}

