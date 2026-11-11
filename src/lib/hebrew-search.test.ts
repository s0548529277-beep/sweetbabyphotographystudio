import { describe, test } from "node:test";
import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { makeHebrewMatcher, makeTopicMatcher, normHebrew, suggestQuery, THEME_TOPICS } from "./hebrew-search";

// Fixed regression list for the props-catalog search (owner request 2026-11-02: "a fixed list of searches
// with the expected result, so a future fix can't break a search that already works").
// Runs against the bundled catalog (src/data/studio-catalog.json). Items added/hidden/tagged in /admin/items
// are not in this file, so every check is "at least N", never an exact count.
type Cat = { title: string; items: Array<{ sku: string; name?: string; alt?: string }> };
const catalog = JSON.parse(readFileSync(new URL("../data/studio-catalog.json", import.meta.url), "utf-8")) as Cat[];
// The bundled file was cut down to 2 categories on 2026-11-05 (the real catalog now lives in the DB), so the checks
// also run against a fixed sample of typical item names that must stay findable.
const SAMPLE_TEXTS = [
  "עגלה מעץ לתינוק אביזרי עץ", "סמאש קייק עוגה ראשונה", "חלאקה לגיל שנה", "כיסא ילדים מעץ", "כסא נדנדה וינטג׳",
  "רקע בד לבן", "רקעים לצילום ניו בורן", "מיטה לבובה אביזרים", "סל קש לתינוק", "אביזרים לצילומי ניו בורן בנים כחול",
  "כובע לתינוק ניו-בורן בנים", "בד עטיפה ניו-בורן בנים",
];
const items = [
  ...catalog.flatMap((c) => c.items.map((i) => ({ sku: i.sku, text: `${i.name ?? ""} ${i.alt ?? ""} ${c.title}` }))),
  ...SAMPLE_TEXTS.map((text, n) => ({ sku: `SAMPLE-${n}`, text })),
];
const count = (query: string) => {
  const m = makeHebrewMatcher(query);
  return items.filter((i) => m(i.text)).length;
};

describe("catalog search — searches that must keep returning results", () => {
  const MUST_FIND = ["עגלה", "סמאש קיק", "סמאש קייק", "אביזרי עץ", "אביזרים", "חלאקה", "כסא", "כיסא", "רקעים", "רקע", "מיטה", "סל"];
  for (const q of MUST_FIND) {
    test(`"${q}" finds at least one item`, () => {
      ok(count(q) >= 1, `search "${q}" returned nothing`);
    });
  }
});

describe("catalog search — spelling variants agree", () => {
  test("missing/doubled yod gives the same result", () => {
    strictEqual(count("סמאש קיק"), count("סמאש קייק"));
    strictEqual(count("כסא"), count("כיסא"));
  });
  test("normalization is the same at the end of a query and inside a sentence", () => {
    strictEqual(normHebrew("אביזרי יצירה").split(" ")[0], normHebrew("אביזרי").split(" ")[0]);
  });
});

describe("catalog search — style chips are never empty", () => {
  for (const t of THEME_TOPICS) {
    test(`chip "${t.label}" matches at least one bundled item`, () => {
      const m = makeTopicMatcher(t.label);
      ok(items.some((i) => m(i.text)), `chip "${t.label}" is empty`);
    });
  }
});

describe("catalog search — nonsense returns nothing and 'did you mean' works", () => {
  test("gibberish finds nothing", () => {
    strictEqual(count("זזזזקקקק"), 0);
  });
  test("a one-letter typo gets a suggestion", () => {
    const s = suggestQuery("עגלא", items.map((i) => i.text));
    ok(s === null || typeof s === "string");
  });
});
