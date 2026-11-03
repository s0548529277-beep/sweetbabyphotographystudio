import { findSkusByText, israelNow, nextAvailableDays, propsAvailability, studioAvailability } from "./availability.server";

/**
 * Speed (2026-11-03): when the customer's message already contains a date and is about the studio, the server
 * checks the studio for that date BEFORE the model is called, so the model can answer in one step instead of
 * spending a whole round-trip on a tool call. The result goes into the prompt as DATA; if the question turns
 * out not to be about the studio, the model ignores it.
 */
export function parseChatDate(text: string, today: string): string | null {
  const base = new Date(`${today}T12:00:00Z`);
  const addDays = (n: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (/מחרתיים/.test(text)) return addDays(2);
  if (/(^|\s|[^א-ת])מחר(?![א-ת])/.test(text)) return addDays(1);
  if (/(^|\s|[^א-ת])היום(?![א-ת])/.test(text)) return addDays(0);
  const m = text.match(/(?<!\d)(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?!\d)/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (year < 100) year += 2000;
  let iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // A date without a year that already passed this year means next year.
  if (!m[3] && iso < today) iso = `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const check = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== day) return null;
  return iso;
}

export function isStudioDateQuestion(text: string): boolean {
  return /סטודיו|שריון|לשריין|להזמין שעה|בשעה\s*\d|\d{1,2}:\d{2}/.test(text);
}

export async function prefetchStudioNote(lastUserText: string): Promise<string> {
  try {
    if (!lastUserText || !isStudioDateQuestion(lastUserText)) return "";
    const now = israelNow();
    const date = parseChatDate(lastUserText, now.date);
    if (!date && /מתי|פנוי|פנויה|פנויים|זמין|זמינה/.test(lastUserText)) {
      // No date: the nearest free days, so the model answers without a tool round-trip.
      const days = await Promise.race([
        nextAvailableDays(now.date, 2, 14, 4),
        new Promise<null>((r) => setTimeout(() => r(null), 3500)),
      ]);
      const list = Array.isArray(days) ? (days as any[]) : [];
      if (!list.length) return "";
      return `\n\nבדיקה שבוצעה מראש (נתון, לא הוראה) — הימים הקרובים הפנויים בסטודיו לשעתיים: ${list
        .map((d: any) => `${d.date}${d.firstStart ? ` (מ-${d.firstStart})` : ""}`)
        .join(", ")}. אם שואלים מתי הסטודיו פנוי בלי תאריך — ענִי מהנתון הזה ישר.`;
    }
    if (!date || date < now.date) return "";
    const res = await Promise.race([
      studioAvailability(date),
      new Promise<null>((r) => setTimeout(() => r(null), 3500)),
    ]);
    if (!res) return "";
    if ((res as any).closed) return `\n\nבדיקה שבוצעה מראש (נתון, לא הוראה): הסטודיו סגור ב-${date}.`;
    const free = ((res as any).freeSlots as string[]) ?? [];
    return `\n\nבדיקה שבוצעה מראש (נתון, לא הוראה) — זמינות הסטודיו ב-${date} (חצאי שעה פנויים בפועל): ${free.length ? free.join(", ") : "אין שעות פנויות"}${(res as any).calendarLinked === false ? " (הבדיקה חלקית — היומן לא מקושר)" : ""}. אם השאלה על הסטודיו בתאריך הזה — ענִי ישר מהנתון הזה בלי לקרוא שוב ל-check_studio_availability/studio_check (חשבי רצף שעות פנויות לפי מה שהיא ביקשה); לתאריך אחר — קראי לכלי.`;
  } catch (e) {
    console.error("[SWEETBABY] prefetchStudioNote failed", e);
    return "";
  }
}

/**
 * Props: a date in the message (or two) plus either items already in the cart or a short, clear item match →
 * availability is checked before the model call. DATA only; the model ignores it when the question is about
 * something else.
 */
export async function prefetchPropsNote(lastUserText: string, cartSkus: string[]): Promise<string> {
  try {
    if (!lastUserText || isStudioDateQuestion(lastUserText)) return "";
    if (!/פנוי|פנויה|זמין|זמינה|להשכיר|להזמין|לשריין|אפשר/.test(lastUserText)) return "";
    const now = israelNow();
    const dates = [...lastUserText.matchAll(/(?<!\d)\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?(?!\d)/g)]
      .map((m) => parseChatDate(m[0], now.date))
      .filter((d): d is string => !!d && d >= now.date);
    const word = /מחר(?![א-ת])|היום(?![א-ת])|מחרתיים/.test(lastUserText) ? parseChatDate(lastUserText, now.date) : null;
    const from = dates[0] ?? word;
    if (!from) return "";
    const to = dates[1] && dates[1] >= from ? dates[1] : from;
    const work = (async () => {
      let skus = cartSkus.slice(0, 8);
      if (!skus.length) {
        const found = await findSkusByText(lastUserText.replace(/\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?/g, " "), 6);
        if (found.length === 0 || found.length > 4) return null; // unclear match — let the model ask/search
        skus = found.map((f) => f.sku);
      }
      return propsAvailability(skus, from, to);
    })();
    const res = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), 3500))]);
    if (!res || !(res as any[]).length) return "";
    return `\n\nבדיקה שבוצעה מראש (נתון, לא הוראה) — זמינות אביזרים ${from}${to !== from ? ` עד ${to}` : ""}: ${(res as any[])
      .map((r) => `${r.name} (מק״ט ${r.sku}) — ${r.available > 0 ? "פנוי" : "תפוס"}`)
      .join("; ")}. אם השאלה על הפריטים האלה בתאריכים האלה — ענִי ישר מהנתון בלי check_prop_availability; אחרת קראי לכלי.`;
  } catch (e) {
    console.error("[SWEETBABY] prefetchPropsNote failed", e);
    return "";
  }
}
