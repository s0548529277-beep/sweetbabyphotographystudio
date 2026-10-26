/**
 * Groups the contract's sections into a few related blocks for the signing
 * page — one "קראתי" per block instead of per section (owner request
 * 2026-10-26: "שיילחצו סעיפים שקשורים אחד לשני"). Shared by the page and the
 * confirm server functions (which check readCount against groups.length).
 * Matching is by section title; any title not listed lands in "עוד דברים"
 * so a new/renamed section is never silently dropped from signing.
 */

export type SigningSection = { title: string; html: string };
export type SigningGroup = { title: string; sections: SigningSection[] };

const GROUPS: { title: string; match: (t: string) => boolean }[] = [
  {
    title: "החבילה והתשלום",
    match: (t) => ["פרטי החבילה", "מקדמה", "אופן התשלום"].includes(t),
  },
  {
    title: "מועד והגעה",
    match: (t) =>
      t === "מועד ושעת הצילום" ||
      t === "הגעה ליום הצילומים" ||
      t === "דיוק בזמנים ואיחורים" ||
      t.startsWith("צילומי משפחה") ||
      t === "סעיף לצילומי ניו בורן",
  },
  {
    title: "הכנות וסטיילינג",
    match: (t) =>
      t.startsWith("סטיילינג") ||
      t.startsWith("סטייילינג") ||
      t.startsWith("ביגוד") ||
      t.includes("הכנות ליום הצילום") ||
      t === "אמא" ||
      t === "צילומים עם אחים",
  },
  {
    title: "ביום הצילומים",
    match: (t) =>
      t === "בטיחות ואחריות" ||
      t === "שיתוף פעולה" ||
      t.startsWith("הוצאות חיצוניות") ||
      t.startsWith("דגשים") ||
      t === "עוד כמה דברים שחשוב לדעת",
  },
  {
    title: "אחרי הצילומים",
    match: (t) =>
      t.startsWith("אחרי הצילומים") ||
      t === "איחורים בבחירת התמונות" ||
      t.startsWith("עריכות") ||
      t === "תיקונים בעיצוב האלבום",
  },
];

export function groupContractSections(sections: SigningSection[]): SigningGroup[] {
  const buckets = GROUPS.map((g) => ({ title: g.title, sections: [] as SigningSection[] }));
  const rest: SigningSection[] = [];
  for (const s of sections) {
    const i = GROUPS.findIndex((g) => g.match(s.title));
    if (i === -1) rest.push(s);
    else buckets[i].sections.push(s);
  }
  const out = buckets.filter((b) => b.sections.length > 0);
  if (rest.length) out.push({ title: "עוד דברים", sections: rest });
  return out;
}
