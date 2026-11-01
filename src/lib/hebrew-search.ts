// Forgiving Hebrew text matching for the props catalog and the chat bot.
// Handles construct state (עגלה/עגלת), plurals (רקעים/רקע), missing yod
// (כסא/כיסא), attached prefixes (מעץ, לבנה stays), multi-word queries in any
// order, and topic synonyms (חלאקה, סמאש קייק, בגדים).

const FINALS: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u0591-\u05C7"'׳״`]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/(.)י(?=.)/g, "$1") // drop inner yod: כיסא→כסא
    .replace(/(.)ו(?=.)/g, "$1"); // drop inner vav: שולחן→שלחנ
}

/** Base form of one Hebrew word (strip plural/construct/feminine endings). */
function stem(w: string): string {
  let s = norm(w);
  for (const suf of ["ימ", "ת", "ה", "מ"]) {
    if (s.length > 3 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

const SYNONYMS: Record<string, string[]> = {
  חלאקה: ["חלאקה", "כיפה", "ציצית", "ספר", "אותיות", "אלף בית", "סוס", "קורקינט", "תלמוד"],
  "סמאש קייק": ["סמאש", "עוגה", "בלון", "מעמד", "שרפרף", "יום הולדת"],
  סמאש: ["סמאש", "עוגה", "בלון", "מעמד", "יום הולדת"],
  בגדים: ["בגד", "סרבל", "שמלה", "חצאית", "גופיה", "מעיל", "חולצה", "מכנס", "כובע", "בודי", "תלבושת"],
  כסא: ["כסא", "כיסא", "שרפרף", "ספסל"],
};

function wordVariants(word: string): string[] {
  const n = norm(word);
  const out = new Set([n, stem(word)]);
  const raw = word.replace(/[ךםןףץ]/g, (c) => FINALS[c]);
  // plural endings on the raw word (before yod is dropped): עצים→עצ, שמלות→שמל
  for (const suf of ["ימ", "ות"]) if (raw.length > 3 && raw.endsWith(suf)) out.add(norm(raw.slice(0, -2)));
  // construct state: מיטה ↔ מיטת
  if (n.endsWith("ה")) out.add(n.slice(0, -1) + "ת");
  if (n.endsWith("ת")) out.add(n.slice(0, -1) + "ה");
  // attached one-letter prefixes: מ/ל/ב/ה/ו/ש/כ
  if (n.length > 3 && "מלבהושכ".includes(n[0])) {
    out.add(n.slice(1));
    out.add(stem(word.slice(1)));
  }
  return [...out].filter((v) => v.length >= 2);
}

/** Returns a predicate that checks a haystack text against the query. */
export function makeHebrewMatcher(query: string): (text: string) => boolean {
  const q = query.trim();
  if (!q) return () => true;
  const syn = SYNONYMS[q] ?? SYNONYMS[q.replace(/\s+/g, " ")];
  if (syn) {
    const ns = syn.map(norm);
    return (text) => {
      const h = norm(text);
      return ns.some((s) => h.includes(s));
    };
  }
  const words = q.split(/\s+/).filter(Boolean);
  const groups = words.map((w) => [...wordVariants(w), ...(SYNONYMS[w] ?? []).map(norm)]);
  return (text) => {
    const h = norm(text);
    return groups.every((vs) => vs.some((v) => h.includes(v)));
  };
}
