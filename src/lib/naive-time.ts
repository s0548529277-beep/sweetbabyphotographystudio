/**
 * orders.pickup_at / return_at hold an Israel wall-clock time written as if it were UTC
 * ("2026-11-03T20:00:00" -> stored/returned as "2026-11-03 20:00:00+00"). They must be READ by
 * slicing the digits — never through `new Date()` / `toLocaleTimeString`, which would shift them by
 * the viewer's / server's timezone (+2h in winter, +3h in summer) and, in the calendar, move the event.
 */
export const naiveDate = (s: string | null | undefined): string | null => (s ? String(s).slice(0, 10) : null);
export const naiveHHMM = (s: string | null | undefined): string | null => (s ? String(s).slice(11, 16) : null);
/** "2026-11-03T20:00:00" — no offset, so Google Calendar applies the given timeZone (Asia/Jerusalem). */
export const naiveLocalISO = (s: string | null | undefined): string | null => (s ? `${String(s).slice(0, 10)}T${String(s).slice(11, 16)}:00` : null);
/** Real epoch ms of a naive Israel wall-clock value. */
export function naiveIsraelMs(s: string): number {
  const asUtc = Date.parse(`${String(s).slice(0, 10)}T${String(s).slice(11, 16)}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(asUtc));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return asUtc - (shown - asUtc);
}
