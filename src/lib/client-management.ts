// Shared (client-safe) pieces of the "ניהול לקוחות" admin area —
// /admin/client-management. Types, defaults, labels and the small Hebrew
// calendar helpers the calendar view needs. Server-only parts (emails,
// the periodic reminder job) live in client-management.functions.ts.
import { HDate, gematriya } from "@hebcal/hdate";

export type CmClient = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  baby_name: string | null;
  birth_date: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
};

export type CmSessionStatus =
  "scheduled" | "shot" | "selecting" | "editing" | "delivered" | "cancelled";

export type CmSession = {
  id: string;
  client_id: string;
  session_date: string;
  start_time: string;
  session_type: string;
  time_slot: string | null;
  part_label: string | null;
  status: CmSessionStatus;
  notes: string | null;
  reminder_sent_at: string | null;
  created_at: string;
};

export type CmPaymentAccount = {
  id: string;
  client_id: string;
  session_id: string | null;
  title: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Session pipeline — an addition over a plain "scheduled/history" split, so each shoot's real progress is visible at a glance. */
export const SESSION_STATUSES: { value: CmSessionStatus; label: string; tone: string }[] = [
  { value: "scheduled", label: "נקבע", tone: "bg-sky-100 text-sky-800" },
  { value: "shot", label: "צולם", tone: "bg-violet-100 text-violet-800" },
  { value: "selecting", label: "בבחירת תמונות", tone: "bg-amber-100 text-amber-800" },
  { value: "editing", label: "בעיבוד", tone: "bg-orange-100 text-orange-800" },
  { value: "delivered", label: "נמסר", tone: "bg-emerald-100 text-emerald-800" },
  { value: "cancelled", label: "בוטל", tone: "bg-muted text-muted-foreground" },
];

export function statusMeta(s: string) {
  return SESSION_STATUSES.find((x) => x.value === s) ?? SESSION_STATUSES[0];
}

export const PART_OPTIONS = ["", "1/1", "1/2", "2/2", "1/3", "2/3", "3/3"];

export type CmSettings = {
  sessionTypes: string[];
  timeSlots: string[];
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  includeNotesInReminder: boolean;
  noShabbatEmails: boolean;
  dailyScheduleEnabled: boolean;
  dailyScheduleHour: number;
  scheduleEmail: string;
  paymentEmailOnOpen: boolean;
  paymentEmailOnUpdate: boolean;
  paymentCopyEmail: string;
  bankDetails: string;
  paymentLinks: string;
};

export const DEFAULT_CM_SETTINGS: CmSettings = {
  sessionTypes: ["ניו בורן", "חלאקה", "סמאש קייק", "משפחה", "גיל שנה", "צילומי חוץ"],
  timeSlots: [
    "צילומי סטודיו בוקר",
    "צילומי סטודיו צהריים",
    "צילומי סטודיו ערב",
    "צילומי חוץ שקיעה",
  ],
  reminderEnabled: true,
  reminderHoursBefore: 24,
  includeNotesInReminder: false,
  noShabbatEmails: true,
  dailyScheduleEnabled: true,
  dailyScheduleHour: 20,
  scheduleEmail: "s0548529277@gmail.com",
  paymentEmailOnOpen: true,
  paymentEmailOnUpdate: true,
  paymentCopyEmail: "s0548529277@gmail.com",
  bankDetails: "",
  paymentLinks: "",
};

export const CM_SETTINGS_KEY = "client_management_settings";

export function parseCmSettings(raw: string | null | undefined): CmSettings {
  if (!raw) return { ...DEFAULT_CM_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CM_SETTINGS, ...(parsed ?? {}) };
  } catch {
    return { ...DEFAULT_CM_SETTINGS };
  }
}

export const REMINDER_HOUR_OPTIONS = [1, 2, 5, 12, 24, 36, 48];

export function balanceOf(a: Pick<CmPaymentAccount, "total_amount" | "paid_amount">) {
  return Math.max(0, Number(a.total_amount || 0) - Number(a.paid_amount || 0));
}

export function shekel(n: number) {
  return `₪${Math.round(Number(n || 0)).toLocaleString("he-IL")}`;
}

/** Local YYYY-MM-DD (not UTC — a late-evening date in Israel must not slip to tomorrow). */
export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDateIL(s: string | null | undefined) {
  if (!s) return "—";
  const d = fromYmd(s);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

const HEB_MONTH_NAMES: Record<number, string> = {
  1: "ניסן",
  2: "אייר",
  3: "סיון",
  4: "תמוז",
  5: "אב",
  6: "אלול",
  7: "תשרי",
  8: "חשון",
  9: "כסלו",
  10: "טבת",
  11: "שבט",
  12: "אדר",
  13: "אדר ב׳",
};

/** "י״ג חשון" — short Hebrew day label for a calendar cell. */
export function hebrewDayLabel(d: Date) {
  const h = new HDate(d);
  const leap = HDate.isLeapYear(h.getFullYear());
  const m = h.getMonth();
  const monthName = m === 12 && leap ? "אדר א׳" : HEB_MONTH_NAMES[m];
  return `${gematriya(h.getDate())} ${monthName}`;
}

/** "חשון–כסלו תשפ״ז" style caption for a Gregorian month. */
export function hebrewMonthCaption(year: number, month0: number) {
  const first = new HDate(new Date(year, month0, 1));
  const last = new HDate(new Date(year, month0 + 1, 0));
  const a = HEB_MONTH_NAMES[first.getMonth()];
  const b = HEB_MONTH_NAMES[last.getMonth()];
  const yearStr = gematriya(last.getFullYear() % 1000);
  return a === b ? `${a} ${yearStr}` : `${a}–${b} ${yearStr}`;
}

/**
 * Major Jewish holidays (Israel schedule) for a date, or null. A compact
 * table rather than a full holiday library — enough to warn before booking
 * a shoot on a חג and to label the calendar.
 */
export function holidayFor(d: Date): string | null {
  const h = new HDate(d);
  const m = h.getMonth();
  const day = h.getDate();
  const leap = HDate.isLeapYear(h.getFullYear());
  const purimMonth = leap ? 13 : 12;
  if (m === 7) {
    if (day === 1 || day === 2) return "ראש השנה";
    if (day === 9) return "ערב יום כיפור";
    if (day === 10) return "יום כיפור";
    if (day === 14) return "ערב סוכות";
    if (day === 15) return "סוכות";
    if (day >= 16 && day <= 20) return "חול המועד סוכות";
    if (day === 21) return "הושענא רבה";
    if (day === 22) return "שמיני עצרת";
  }
  if (m === 6 && day === 29) return "ערב ראש השנה";
  if (m === 9 || m === 10) {
    // Chanukah: 8 days from 25 Kislev (Kislev may have 29 or 30 days, so count from the start).
    const sinceStart = h.deltaDays(new HDate(25, 9, h.getFullYear()));
    if (sinceStart >= 0 && sinceStart <= 7) return "חנוכה";
    if (m === 10 && day === 10) return "עשרה בטבת";
  }
  if (m === 11 && day === 15) return "ט״ו בשבט";
  if (m === purimMonth && day === 13) return "תענית אסתר";
  if (m === purimMonth && day === 14) return "פורים";
  if (m === purimMonth && day === 15) return "שושן פורים";
  if (m === 1) {
    if (day === 14) return "ערב פסח";
    if (day === 15) return "פסח";
    if (day >= 16 && day <= 20) return "חול המועד פסח";
    if (day === 21) return "שביעי של פסח";
  }
  if (m === 2 && day === 18) return "ל״ג בעומר";
  if (m === 3 && day === 5) return "ערב שבועות";
  if (m === 3 && day === 6) return "שבועות";
  if (m === 4 && day === 17) return "י״ז בתמוז";
  if (m === 5 && day === 9) return "תשעה באב";
  return null;
}

/** True on Shabbat or a yom tov where shooting/emails should be avoided. */
export function isRestDay(d: Date) {
  if (d.getDay() === 6) return true;
  const hol = holidayFor(d);
  return (
    hol != null &&
    ["ראש השנה", "יום כיפור", "סוכות", "שמיני עצרת", "פסח", "שביעי של פסח", "שבועות"].includes(hol)
  );
}

export function whatsappLink(phone: string | null | undefined, text?: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
