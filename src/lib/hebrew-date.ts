/** Hebrew (Jewish) calendar date — shown alongside the Gregorian date. */
export function hebrewDate(input?: string | Date | null): string {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("he-u-ca-hebrew", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
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
