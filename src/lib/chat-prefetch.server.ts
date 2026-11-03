import { israelNow, studioAvailability } from "./availability.server";

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
