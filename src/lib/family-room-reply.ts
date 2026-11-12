/**
 * Reads the owner's FREE-TEXT answer about the family room (owner request 2026-11-12: even a plain reply "קבעתי" must work).
 * Pure helpers used by the hourly e-mail assistant (`email-drafts.server.ts`); no I/O.
 *  - `ownText`: only what she wrote, without the quoted mail underneath.
 *  - `parseFamilyRoomReply`: decision (booked / not booked / none), the hours she named (if any) and the booking id found anywhere in the mail (the quoted order summary carries "#abcd1234").
 *  - `hourlySlots`: the whole session as hourly slots, used when she says "קבעתי" without naming hours.
 */

/** Her own text: everything before the first quoted line ("> …", "בתאריך … כתב:", "On … wrote:"). */
export function ownText(body: string): string {
  const out: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/[‎‏‪-‮]/g, "").trim();
    if (/^>/.test(line) || /^(בתאריך|ב־|ביום).{0,80}(כתב|כתבה|מאת)/.test(line) || /^On .{0,100}wrote:?$/i.test(line) || /^-{2,}\s*(Forwarded|Original)/i.test(line)) break;
    out.push(raw);
  }
  return out.join("\n").trim();
}

const NEGATIVE = /לא\s+(נקבע|קבעתי|הצלחתי|שריינתי|אושר|פנוי)|תפוס|אין\s+(חדר|מקום|זמינות)/;
const POSITIVE = /קבעתי|נקבע|אושר|סגרתי|שריינתי/;

const pad = (h: number, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** Hours named in her text: a range ("18-20", "18:00–20:00", "18:00 עד 20:00") -> "18:00-20:00"; otherwise the "HH:MM" times she listed. Empty string when none. */
export function hoursFromText(text: string): string {
  const range = text.match(/(\d{1,2})(?::(\d{2}))?\s*(?:-|–|עד)\s*(\d{1,2})(?::(\d{2}))?/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[3]);
    if (a >= 6 && a <= 23 && b >= 7 && b <= 24 && b > a) return `${pad(a, Number(range[2] ?? 0))}-${pad(b, Number(range[4] ?? 0))}`;
  }
  const times = [...new Set((text.match(/\b\d{1,2}:\d{2}\b/g) ?? []).map((t) => t.padStart(5, "0")))];
  return times.join(", ");
}

/** The whole session as hourly slots, e.g. 18:00–21:00 -> "18:00, 19:00, 20:00". */
export function hourlySlots(start: string, end: string): string {
  const s = Number(String(start).slice(0, 2));
  const e = Number(String(end).slice(0, 2)) + (Number(String(end).slice(3, 5)) > 0 ? 1 : 0);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return "";
  const out: string[] = [];
  for (let h = s; h < e; h++) out.push(pad(h));
  return out.join(", ");
}

export function parseFamilyRoomReply(body: string): {
  decision: "booked" | "not_booked" | null;
  hours: string;
  idPrefix: string | null;
  /** Session date (YYYY-MM-DD) and client name from the quoted "room to book" notification, which has no order id. */
  date: string | null;
  name: string | null;
} {
  const mine = ownText(body);
  const decision = NEGATIVE.test(mine) ? "not_booked" : POSITIVE.test(mine) ? "booked" : null;
  const idPrefix =
    body.match(/הזמנה\s*:?\s*#?\s*([0-9a-f]{8})\b/i)?.[1]?.toLowerCase() ?? body.match(/#([0-9a-f]{8})\b/i)?.[1]?.toLowerCase() ?? null;
  const dm = body.match(/תאריך\s*:?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  const date = dm ? `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` : null;
  const name = body.match(/(?:^|\n)[>\s]*1\.\s*([^\n\r]{2,60})/)?.[1]?.trim() ?? null;
  return { decision, hours: decision === "booked" ? hoursFromText(mine) : "", idPrefix, date, name };
}
