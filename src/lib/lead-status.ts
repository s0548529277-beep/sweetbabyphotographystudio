// Stages of an inquiry lead (public.inquiry_leads.status). One list for the admin screen and the digest mail buttons.
export const LEAD_STAGES: { key: string; label: string; cls: string }[] = [
  { key: "new", label: "חדשה – לא נענתה", cls: "bg-rose-100 text-rose-800" },
  { key: "replied", label: "נענתה", cls: "bg-sky-100 text-sky-800" },
  { key: "in_talk", label: "בשיחה", cls: "bg-violet-100 text-violet-800" },
  { key: "follow_up", label: "נשלח מעקב", cls: "bg-amber-100 text-amber-800" },
  { key: "booked", label: "סגרה ✓", cls: "bg-emerald-100 text-emerald-800" },
  { key: "not_relevant", label: "לא רלוונטי", cls: "bg-stone-200 text-stone-600" },
];
export const LEAD_STATUS_KEYS = LEAD_STAGES.map((s) => s.key);
export const leadStageLabel = (k: string) => LEAD_STAGES.find((s) => s.key === k)?.label ?? k;
/** Stages that are still "open" (not closed and not dropped). */
export const OPEN_LEAD_STAGES = ["new", "replied", "in_talk", "follow_up"];

/**
 * Actions of the signed links in the lead mails that are not a plain stage:
 *  - menu: opens the "שנה סטטוס" page (read-only, shows the choices);
 *  - remind_tomorrow: stage follow_up + remind_at = tomorrow 08:00 Israel time ("תזכירי לי מחר");
 *  - customer: she is already a customer -> stage booked, then the page leads to the new-customer card.
 */
export const LEAD_ACTIONS = ["menu", "remind_tomorrow", "customer"] as const;
export type LeadAction = (typeof LEAD_ACTIONS)[number];

/** Israel wall-clock "YYYY-MM-DD" + "HH:MM" -> real UTC ISO string (DST-safe). */
export function israelWallToIso(date: string, hm: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(asUtc));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  return new Date(asUtc - (shown - asUtc)).toISOString();
}

/** Tomorrow 08:00 Israel time (the date is the Israeli calendar date of "now + 24h"). */
export function tomorrowMorningIso(now: Date = new Date()): string {
  const tomorrow = new Date(now.getTime() + 24 * 3600_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  return israelWallToIso(tomorrow, "08:00");
}
