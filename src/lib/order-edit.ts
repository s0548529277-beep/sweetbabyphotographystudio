import { naiveIsraelMs } from "@/lib/naive-time";

/**
 * Customer edits of a studio booking / props order (owner request 2026-11-14).
 * Pure helpers, safe for both the edit page (client) and the server functions.
 */

export type EditKind = "booking" | "order";

/** An edit made less than this many hours before the session must be approved by the admin. */
export const EDIT_APPROVAL_WINDOW_HOURS = 24;

/** Real epoch ms of an Israel wall-clock date ("YYYY-MM-DD") + time ("HH:MM"). */
export function sessionStartMs(date: string, time: string): number {
  return naiveIsraelMs(`${date.slice(0, 10)}T${time.slice(0, 5)}:00`);
}

export function addMinutesHHMM(time: string, minutes: number): string {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Approval rule: the edit needs the admin when the session starts in less than 24h — judged by the CURRENT start
 * and by the NEW start (so a far-away booking cannot be dragged into the next 24h without approval either).
 */
export function editNeedsApproval(opts: { oldStartMs: number; newStartMs: number; nowMs?: number }): { needs: boolean; reason: string | null } {
  const now = opts.nowMs ?? Date.now();
  const limit = EDIT_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000;
  if (opts.oldStartMs - now < limit) return { needs: true, reason: `המועד הנוכחי בעוד פחות מ-${EDIT_APPROVAL_WINDOW_HOURS} שעות` };
  if (opts.newStartMs - now < limit) return { needs: true, reason: `המועד החדש בעוד פחות מ-${EDIT_APPROVAL_WINDOW_HOURS} שעות` };
  return { needs: false, reason: null };
}

/** What a customer may change in a studio booking (same duration, so the price stays). */
export type BookingChanges = { session_date?: string; start_time?: string; note?: string };
/** What a customer may change in a props order (same dates, so the rental days/price stay). */
export type OrderChanges = { pickup_time?: string; return_time?: string; note?: string };

export const CHANGE_LABELS: Record<string, string> = {
  session_date: "תאריך הצילום",
  start_time: "שעת התחלה",
  pickup_time: "שעת איסוף",
  return_time: "שעת החזרה",
  note: "הערה",
};
