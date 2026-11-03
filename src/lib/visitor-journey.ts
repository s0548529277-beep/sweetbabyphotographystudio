/**
 * Pure logic for the visitor journey (no DB, no browser): phone/email normalization, page labels, the "hot lead"
 * rule and building one person's journey from raw analytics rows. Used by the server functions
 * (visitor-tracking.server.ts) and by the admin screens; covered by visitor-journey.test.ts.
 */

/** Phone key: digits only, without the Israeli leading 0 or the 972 prefix, so every spelling of a number matches. */
export function phoneKey(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00972")) d = d.slice(5);
  else if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 8 && d.length <= 11 ? d : null;
}

export function emailKey(raw: string | null | undefined): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return e.includes("@") && e.length <= 160 ? e : null;
}

const PAGE_LABELS: Record<string, string> = {
  "/": "עמוד הבית",
  "/rental-catalog": "קטלוג אביזרים",
  "/studio-rental": "השכרת סטודיו",
  "/studio-photography": "צילומים בסטודיו",
  "/booking": "הזמנת סטודיו",
  "/cart": "עגלה",
  "/checkout": "תשלום על הזמנה",
  "/collage-maker": "יצירת קולאז׳",
  "/about": "אודות",
  "/contact": "צור קשר",
  "/blog": "בלוג",
  "/terms": "תקנון ופרטיות",
};

export function pageLabel(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  if (path.startsWith("/items/")) return "עמוד פריט";
  if (path.startsWith("/deposit/")) return "תשלום מקדמה";
  if (path.startsWith("/blog/")) return "מאמר בבלוג";
  return path;
}

/** Pages where time spent means she is considering ordering. */
export const PRICE_PAGES = ["/studio-rental", "/booking", "/cart", "/checkout"];
export const HOT_MIN_VISITS = 3;
export const HOT_MIN_SECONDS_ON_PRICE_PAGES = 60;

export type JourneyPage = { path: string; label: string; views: number; seconds: number };
export type VisitorJourney = {
  visits: number;
  firstSeen: string | null;
  lastSeen: string | null;
  source: string | null;
  totalSeconds: number;
  pages: JourneyPage[];
  hot: boolean;
  hotReasons: string[];
};

export function hotRule(visits: number, pages: { path: string; seconds: number }[]): { hot: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (visits >= HOT_MIN_VISITS) reasons.push(`ביקרה ${visits} פעמים`);
  const priceSeconds = pages.filter((p) => PRICE_PAGES.includes(p.path)).reduce((s, p) => s + p.seconds, 0);
  if (priceSeconds >= HOT_MIN_SECONDS_ON_PRICE_PAGES) reasons.push(`שהתה ${priceSeconds} שנ׳ בעמודי הזמנה ומחיר`);
  return { hot: reasons.length > 0, reasons };
}

type SessionRow = { id: string; first_seen: string; last_seen: string; source: string | null };
type EventRow = { session_id: string; type: string; path: string; duration_seconds: number | null };

/** One person's journey from all of her sessions' rows (one or several visitor ids can feed the same person). */
export function buildJourney(sessions: SessionRow[], events: EventRow[]): VisitorJourney {
  const sorted = sessions.slice().sort((a, b) => a.first_seen.localeCompare(b.first_seen));
  const ids = new Set(sorted.map((s) => s.id));
  const byPath = new Map<string, JourneyPage>();
  let total = 0;
  for (const e of events) {
    if (!ids.has(e.session_id) || e.type !== "pageview") continue;
    const row = byPath.get(e.path) ?? { path: e.path, label: pageLabel(e.path), views: 0, seconds: 0 };
    row.views += 1;
    const sec = Math.max(0, Math.min(1800, e.duration_seconds ?? 0));
    row.seconds += sec;
    total += sec;
    byPath.set(e.path, row);
  }
  const pages = Array.from(byPath.values()).sort((a, b) => b.seconds - a.seconds || b.views - a.views);
  const { hot, reasons } = hotRule(sorted.length, pages);
  return {
    visits: sorted.length,
    firstSeen: sorted[0]?.first_seen ?? null,
    lastSeen: sorted.reduce<string | null>((m, s) => (m && m > s.last_seen ? m : s.last_seen), null),
    source: sorted[0]?.source ?? null,
    totalSeconds: total,
    pages,
    hot,
    hotReasons: reasons,
  };
}

export function formatSeconds(total: number): string {
  if (total < 60) return `${total} שנ׳`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} דק׳ ${s} שנ׳` : `${m} דק׳`;
}
