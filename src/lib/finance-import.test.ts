import test from "node:test";
import assert from "node:assert/strict";
import { guessColumns, payeeKey, parseRules, parseImportSheets, describeLayout } from "./finance-import";

const cell = (value: string) => ({ value, fillArgb: null });
const row = (...v: string[]) => ({ cells: v.map(cell) });
const noRed = () => false;

test("payeeKey ignores dates, numbers and punctuation so one payee hits one rule", () => {
  assert.equal(payeeKey("PAYBOX 12/10"), "paybox");
  assert.equal(payeeKey("paybox 03/11"), "paybox");
  assert.equal(payeeKey("העברה/הפקדה"), "העברה הפקדה");
});

test("Hapoalim layout: debit/credit columns, title rows skipped, direction from the column", () => {
  const sheet = {
    name: "Sheet",
    rows: [
      row("תנועות בחשבון 533-648912"),
      row(),
      row("תאריך", "תאריך ערך", "פעולה", "פרטים", "אסמכתא", "חובה", "זכות", "יתרה בשקלים"),
      row("01/11/2026", "01/11/2026", "העברה מהבנק", "", "1", "70", "", "2173.75"),
      row("29/10/2026", "29/10/2026", "זיכוי מהמזרחי", "", "2", "", "62", "767.75"),
    ],
  };
  const out = parseImportSheets([sheet], noRed)!;
  assert.equal(out.layout, "בנק הפועלים (עו״ש)");
  assert.deepEqual(out.rows.map((r) => [r.date, r.amount, r.direction]), [
    ["2026-11-01", 70, "expense"],
    ["2026-10-29", 62, "income"],
  ]);
});

test("Credit-card layout: one amount column, all charges are expenses; summary tabs are ignored", () => {
  const summary = { name: "סיכום", rows: [row("חודש", "הכנסות", "הוצאות"), row("ספטמבר", "1", "2")] };
  const tx = {
    name: "עסקאות",
    rows: [
      row("תאריך עסקה", "שם בית עסק", "סכום עסקה", "סכום חיוב"),
      row("12/10/2026", "PAYBOX 12/10", "152.88", "152.88"),
    ],
  };
  const out = parseImportSheets([summary, tx], noRed)!;
  assert.deepEqual(out.sheetsUsed, ["עסקאות"]);
  assert.equal(out.rows[0].direction, "expense");
  assert.equal(out.rows[0].amount, 152.88);
});

test("single amount column with negatives: sign decides, positives are income", () => {
  const sheet = {
    name: "s",
    rows: [row("תאריך", "תיאור", "סכום"), row("01/01/2026", "קפה", "-20"), row("02/01/2026", "לקוחה", "300")],
  };
  const out = parseImportSheets([sheet], noRed)!;
  assert.deepEqual(out.rows.map((r) => r.direction), ["expense", "income"]);
});

test("guessColumns / describeLayout fall back to a generic layout", () => {
  const cols = guessColumns(["תאריך", "תיאור", "סכום"]);
  assert.deepEqual([cols.date, cols.desc, cols.amount], [0, 1, 2]);
  assert.equal(describeLayout(["תאריך", "תיאור", "סכום"], cols), "דוח כללי (תאריך, תיאור, סכום)");
});

test("parseRules drops malformed entries", () => {
  const rules = parseRules(JSON.stringify({ a: { selection: "business", direction: "income" }, b: { selection: "x" }, c: 5 }));
  assert.deepEqual(Object.keys(rules), ["a"]);
  assert.deepEqual(parseRules("not json"), {});
});

test("parseRules keeps an 'external' (חיצוני) rule", async () => {
  const { parseRules } = await import("./finance-import");
  const r = parseRules(JSON.stringify({ paybox: { selection: "external" }, x: { selection: "bogus" } }));
  assert.deepEqual(r, { paybox: { selection: "external" } });
});

test("Hapoalim export with לטובת / עבור columns: the NAME and purpose are kept, account and ID numbers are removed", () => {
  const sheet = {
    name: "גיליון1",
    rows: [
      row("תנועות בחשבון"),
      row("תאריך", "הפעולה", "פרטים", "אסמכתא", "חובה", "זכות", "יתרה בש''ח", "תאריך ערך", "לטובת", "עבור"),
      row("04.11.2026", "זיכוי מהמזרחי", "המבצע: שטרן אלחנן ונחמה עבור: השכרת מצלמה מח-ן:000444610", "1", "", "120.00", "1", "04.11.2026", "שטרן אלחנן ונחמה", "השכרת מצלמה מח-ן:000444610"),
      row("01.11.2026", "העברה מהבנק", "לטובת: רחל וינברג ", "2", "70.00", "", "1", "01.11.2026", "רחל וינברג", ""),
      row("02.11.2026", "יופיי פיננסים", " עבור: מיכל אפרת אציבע מזהה 322962580", "3", "", "707.07", "1", "02.11.2026", "", "מיכל אפרת אציבע מזהה 322962580"),
      row("04.11.2026", "הפק מזומן-בנקט", "המבצע: 322962580 עבור: הפקדה ללא כרטיס", "4", "", "2,610.00", "1", "04.11.2026", "322962580", "הפקדה ללא כרטיס"),
    ],
  };
  const out = parseImportSheets([sheet], noRed)!;
  assert.deepEqual(out.rows.map((r) => [r.desc, r.payee]), [
    ["שטרן אלחנן ונחמה · השכרת מצלמה", "שטרן אלחנן ונחמה"],
    ["רחל וינברג", "רחל וינברג"],
    ["יופיי פיננסים", ""],
    ["הפק מזומן-בנקט", ""],
  ]);
  assert.ok(out.rows.every((r) => !/\d{8,}/.test(r.desc)));
});

test("Cal card statement: one refund (negative) does not turn the charges into income", () => {
  const sheet = {
    name: "גיליון1",
    rows: [
      row("פירוט עסקאות וזיכויים"),
      row("תאריך עסקה", "שם בית עסק", 'סכום בש"ח', "כרטיס", "מועד חיוב", "סוג עסקה"),
      row("5/11/26", "לאה גולדווסר צילום וקורסי", "₪ 55.00", "דיינרס 6661", "", "רכישה רגילה"),
      row("9/9/26", "PAYPAL *TEMU", "-₪ 118.24", "דיינרס 6661", "10/10/26", "זיכוי"),
      row("9/9/26", "דמיאל", "₪ 2,100.00", "ויזה 8043", "2/10/26", "רגילה"),
    ],
  };
  const out = parseImportSheets([sheet], noRed)!;
  assert.deepEqual(out.rows.map((r) => [r.date, r.amount, r.direction]), [
    ["2026-11-05", 55, "expense"],
    ["2026-09-09", 118.24, "income"],
    ["2026-09-09", 2100, "expense"],
  ]);
});
