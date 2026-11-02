// Forgiving Hebrew text matching for the props catalog and the chat bot.
// Handles construct state (עגלה/עגלת), plurals (רקעים/רקע), missing or doubled
// yod (כסא/כיסא, קיק/קייק), attached prefixes (מעץ), multi-word queries in any
// order, and "topics" (חלאקה, סמאש קייק, בגדים...) that expand into the words
// that really appear in the catalog item names.

const FINALS: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/**
 * Normalizes text for matching. Yod/vav are dropped from every word except its
 * first letter, so spelling variants match: כיסא=כסא, קייק=קיק, אביזרי=אביזר.
 * Done per word (not by peeking at the next character) so a word normalizes
 * the same way at the end of a query and in the middle of a sentence — the old
 * look-ahead version made "אביזרי יצ" and "סמאש קיק" match nothing.
 */
export function normHebrew(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ"'׳״`]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .split(/(\s+)/)
    .map((w) => (w ? w[0] + w.slice(1).replace(/[יו]/g, "") : w))
    .join("");
}
const norm = normHebrew;

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

export type Topic = {
  /** Label shown on the chip and recognised as a search query. */
  label: string;
  /** Other ways to type the same thing. */
  aliases?: string[];
  /**
   * Words that really appear in item names / categories of the catalog.
   * Matched as normalized substrings of "name alt category".
   */
  keywords: string[];
  /** Show as a "לפי סגנון" chip in the catalog. */
  chip?: boolean;
};

/**
 * One source of truth for the style chips, typed searches and the bot.
 * Keep keywords to words that exist in src/data/studio-catalog.json (or the
 * admin-edited names) — a keyword that matches no item makes the chip empty.
 */
export const TOPICS: Topic[] = [
  {
    label: "חלאקה",
    aliases: ["חלאקה", "חלקה", "חלאקא", "תספורת", "אפשרניש", "אופשרניש"],
    keywords: [
      "חלאקה",
      "תספורת",
      "ספר תורה",
      "ספרים",
      "ערימת ספרים",
      "אלף בית",
      "סוס",
      "נדנדה",
      "כיפה",
      "טלית",
    ],
    chip: true,
  },
  {
    label: "סמאש קייק",
    aliases: ["סמאש קייק", "סמאש", "smash cake", "smash", "גיל שנה", "יום הולדת"],
    keywords: [
      "סמאש",
      "smash",
      "עוגה",
      "מעמד עוגה",
      "יום הולדת",
      "דגלון",
      "דגלים",
      "גיל שנה",
      "one",
      "בלון",
      "בלונים",
      "תבנית סיליקון",
      "כובע מספר",
      "כובע נצנץ",
      "כתר זהב",
      "שמלת פסטיבל",
      "אמבטיה",
      "לימון",
      "ברווזים",
    ],
    chip: true,
  },
  {
    label: "ניו-בורן בנים",
    aliases: ["בנים", "בן", "ניו בורן בנים", "ניוב בנים"],
    keywords: ["תכלת", "תכול", "כחול", "טורקיז", "ג'ינס", "ג׳ינס", "דובי", "אוברול", "בנים"],
    chip: true,
  },
  {
    label: "ניו-בורן בנות",
    aliases: ["בנות", "בת", "ניו בורן בנות", "ניוב בנות"],
    keywords: ["ורוד", "ורדרד", "פרח", "סרטים", "כתר", "טוטו", "תחרה", "פפיון", "פנינ", "בנות"],
    chip: true,
  },
  {
    label: "עץ טבעי וכפרי",
    aliases: ["כפרי", "טבעי", "עץ", "רטרו", "וינטג", "וינטג'"],
    keywords: [
      "עץ",
      "ראטן",
      "קלוע",
      "נצרים",
      "מקרמה",
      "קש",
      "וינטג",
      "כפרי",
      "טבעי",
      "לבד",
      "במבוק",
    ],
    chip: true,
  },
  {
    label: "בגדים",
    keywords: [
      "בגד",
      "סרבל",
      "שמלה",
      "חצאית",
      "גופיה",
      "מעיל",
      "חולצה",
      "מכנס",
      "בודי",
      "תלבושת",
      "אוברול",
      "טוטו",
      "בלומרס",
      "ג'ינס",
    ],
  },
  { label: "כסא", keywords: ["כסא", "כיסא", "שרפרף", "ספסל"] },
];

/** The chips shown under "לפי סגנון". */
export const THEME_TOPICS: Topic[] = TOPICS.filter((t) => t.chip);

function topicMatcherFrom(topic: Topic): (text: string) => boolean {
  const ks = topic.keywords.map(norm).filter((k) => k.length >= 1);
  return (text) => {
    const h = norm(text);
    return ks.some((k) => h.includes(k));
  };
}

/** Matcher for one topic's keywords (used by the style chips). */
export function makeTopicMatcher(label: string): (text: string) => boolean {
  const topic = TOPICS.find((t) => t.label === label);
  return topic ? topicMatcherFrom(topic) : () => true;
}

const TOPIC_BY_NAME = new Map<string, Topic>();
for (const t of TOPICS) {
  TOPIC_BY_NAME.set(norm(t.label), t);
  for (const a of t.aliases ?? []) if (!TOPIC_BY_NAME.has(norm(a))) TOPIC_BY_NAME.set(norm(a), t);
}

function wordVariants(word: string): string[] {
  const n = norm(word);
  const out = new Set([n, stem(word)]);
  const raw = word.replace(/[ךםןףץ]/g, (c) => FINALS[c]);
  // plural endings on the raw word (before yod is dropped): עצים→עצ, שמלות→שמל
  for (const suf of ["ימ", "ות"]) if (raw.length > 3 && raw.endsWith(suf)) out.add(norm(raw.slice(0, -2)));
  // construct plural: אביזרי (of) ↔ אביזרים
  if (n.length > 3 && n.endsWith("י")) out.add(n.slice(0, -1));
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

  // Whole query is a known topic (chip label or alias) → match its keywords.
  const topic = TOPIC_BY_NAME.get(norm(q.replace(/\s+/g, " ")));
  if (topic) {
    const tm = topicMatcherFrom(topic);
    const plain = norm(q);
    return (text) => tm(text) || norm(text).includes(plain);
  }

  const words = q.split(/\s+/).filter(Boolean);
  const groups = words.map((w) => {
    const vs = wordVariants(w);
    const wt = TOPIC_BY_NAME.get(norm(w));
    if (wt) vs.push(...wt.keywords.map(norm));
    return vs;
  });
  return (text) => {
    const h = norm(text);
    return groups.every((vs) => vs.some((v) => h.includes(v)));
  };
}

/**
 * Orders results: whole query inside the item name first, then any query word
 * in the name, then matches that only come from the description/category or a
 * topic keyword. Higher is better.
 */
export function relevanceScore(query: string, name: string, rest = ""): number {
  const q = query.trim();
  if (!q) return 0;
  const n = norm(name);
  const whole = norm(q);
  if (n.includes(whole)) return 4;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.some((w) => wordVariants(w).some((v) => n.includes(v)))) return 3;
  const topic = TOPIC_BY_NAME.get(norm(q.replace(/\s+/g, " ")));
  if (topic && topicMatcherFrom(topic)(name)) return 2;
  return norm(rest).includes(whole) ? 1 : 0;
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * "התכוונת ל…?" — for a query that finds nothing, tries to replace words that
 * exist nowhere in the catalog with the closest real word (1–2 letters off).
 * `texts` = all item names/categories. Returns null when nothing better found.
 */
export function suggestQuery(query: string, texts: string[]): string | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const vocab = new Map<string, string>(); // normalized → original
  for (const t of texts) {
    for (const w of t.split(/[\s,/()\-–]+/)) {
      const clean = w.replace(/[^א-תa-zA-Z0-9]/g, "");
      if (clean.length >= 2 && !vocab.has(norm(clean))) vocab.set(norm(clean), clean);
    }
  }
  const keys = [...vocab.keys()];
  let changed = false;
  const fixed = words.map((w) => {
    const nw = norm(w);
    if (nw.length < 4 || keys.some((k) => k.includes(nw))) return w; // too short, or exists
    const max = nw.length >= 8 ? 2 : 1;
    let best: string | null = null;
    let bestD = max + 1;
    for (const k of keys) {
      const d = editDistance(nw, k, max);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best && bestD <= max) {
      changed = true;
      return vocab.get(best)!;
    }
    return w;
  });
  return changed ? fixed.join(" ") : null;
}
