import { isRestDay } from "@/lib/client-management";

/**
 * Owner rule: no automatic customer e-mail on Shabbat / yom tov, nor in the
 * hours around it — from 14:00 on the eve until 22:00 on the rest day itself.
 * Used by the scheduled reminder jobs, which simply skip while this is true
 * and send on a later run (their windows are written to catch up).
 */
export const QUIET_FROM_HOUR_ON_EVE = 14;
export const QUIET_UNTIL_HOUR_ON_REST_DAY = 22;

function israelParts(now: Date): { y: number; m: number; d: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: n("year"), m: n("month"), d: n("day"), hour: n("hour") };
}

export function isQuietForMail(now: Date = new Date()): boolean {
  const { y, m, d, hour } = israelParts(now);
  // Noon UTC of the Israeli calendar day: weekday / Hebrew date come out right on any server time zone.
  const today = new Date(Date.UTC(y, m - 1, d, 12));
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1, 12));
  if (isRestDay(today) && hour < QUIET_UNTIL_HOUR_ON_REST_DAY) return true;
  if (isRestDay(tomorrow) && hour >= QUIET_FROM_HOUR_ON_EVE) return true;
  return false;
}
