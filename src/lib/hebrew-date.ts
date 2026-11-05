const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

/** Number -> Hebrew letters (gematria) with the geresh / gershayim marks: 26 -> כ״ו, 15 -> ט״ו, 5787 -> תשפ״ז. */
export function hebrewNumeral(n: number): string {
  let rest = Math.floor(n);
  if (!(rest > 0)) return "";
  let out = "";
  const h = Math.floor(rest / 100);
  rest %= 100;
  out += HUNDREDS[h] ?? "";
  if (rest === 15) out += "טו";
  else if (rest === 16) out += "טז";
  else out += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  if (out.length === 1) return `${out}׳`;
  return `${out.slice(0, -1)}״${out.slice(-1)}`;
}

/** Hebrew (Jewish) calendar date in LETTERS, like Google Calendar: "כ״ו בחשוון תשפ״ז" (never "26 בחשוון 5787"). */
export function hebrewDate(input?: string | Date | null): string {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const day = Number(get("day"));
    const year = Number(get("year"));
    const month = get("month");
    if (!day || !year || !month) return "";
    // Years are written without the thousands (5787 -> תשפ״ז), as on a Hebrew calendar.
    return `${hebrewNumeral(day)} ב${month} ${hebrewNumeral(year % 1000)}`;
  } catch {
    return "";
  }
}

/** "יום שלישי, 12.8.2026 · כ״ח באב תשפ״ו" */
export function fullHebrewDate(input?: string | Date | null): string {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const greg = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
  const heb = hebrewDate(d);
  return heb ? `${greg} · ${heb}` : greg;
}
