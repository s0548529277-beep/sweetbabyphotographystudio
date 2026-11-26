// Income is counted only after the work was DONE (owner request 2026-11-26): a shoot that took place, a studio rental that
// ended, props that were returned. A booking made for next week is not income yet. Pure and dependency-free (Israel time).

/** Today's date in Israel, "YYYY-MM-DD". */
export const israelToday = (now: Date = new Date()): string => now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

/** The current time in Israel, "HH:MM". */
export function israelHHMM(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${String(Number(g("hour")) % 24).padStart(2, "0")}:${g("minute")}`;
}

/** "10:30" + 2 hours -> "12:30" (null when the start is not a time). Over midnight the result stays below 24h. */
export function endTimeFrom(start: string | null | undefined, hours: number | string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(start ?? ""));
  const h = Number(hours);
  if (!m || !isFinite(h) || h <= 0) return null;
  const total = Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2]) + Math.round(h * 60));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type DoneInput = {
  /** The day the work takes place (session date; for props the return date). */
  date?: string | null;
  /** When it ends that day ("HH:MM"), if known. Without it a work done "today" counts from tomorrow (or once it is marked done). */
  endTime?: string | null;
  /** completed / returned count as done at once. */
  status?: string | null;
  /** The owner's own "shoot done" mark (shoot_done_at of the package tables). */
  doneAt?: string | null;
};

export function isIncomeDone(i: DoneInput, now: Date = new Date()): boolean {
  if (i.doneAt) return true;
  if (i.status === "completed" || i.status === "returned") return true;
  const d = String(i.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const today = israelToday(now);
  if (d < today) return true;
  if (d > today) return false;
  const end = String(i.endTime ?? "").slice(0, 5);
  return /^\d{2}:\d{2}$/.test(end) && israelHHMM(now) >= end;
}

const naiveHHMM = (s: string | null | undefined): string | null => (s ? String(s).slice(11, 16) : null);

/** Props order: done once returned, or once the return date (and time) has passed. */
export function isPropsOrderDone(o: { status?: string | null; return_date?: string | null; scheduled_date?: string | null; session_date?: string | null; return_at?: string | null }, now: Date = new Date()): boolean {
  const date = o.return_date ?? o.scheduled_date ?? o.session_date ?? null;
  const returnAt = o.return_at ? String(o.return_at).slice(0, 10) : null;
  return isIncomeDone({ date, endTime: returnAt && date && returnAt === String(date).slice(0, 10) ? naiveHHMM(o.return_at) : null, status: o.status }, now);
}

/** Studio / photography booking (bookings row). */
export function isBookingDone(b: { status?: string | null; session_date?: string | null; end_time?: string | null }, now: Date = new Date()): boolean {
  return isIncomeDone({ date: b.session_date, endTime: b.end_time, status: b.status }, now);
}

/** Newborn / outdoor / custom-studio package: the shoot date passed, or she marked "shoot done". */
export function isPackageDone(p: { session_date?: string | null; session_time?: string | null; duration_hours?: number | string | null; shoot_done_at?: string | null }, now: Date = new Date()): boolean {
  return isIncomeDone({ date: p.session_date, endTime: endTimeFrom(p.session_time, p.duration_hours), doneAt: p.shoot_done_at }, now);
}
