import { parseAmountCell, parseDateCell, type XlsxRow } from "@/lib/xlsx-read";

/**
 * Smart reading of bank / credit-card Excel exports for the admin finance
 * import. Understands the usual shapes without the owner mapping columns:
 *  - Bank Hapoalim current-account export: תאריך | תאריך ערך | פעולה / תיאור | פרטים | אסמכתא | חובה | זכות | יתרה
 *  - Cal / credit-card export: תאריך עסקה | שם בית עסק | סכום עסקה | סכום חיוב | סוג עסקה | ענף | הערות
 *  - Pagi and any other file: anything with a date column, a description column and either one
 *    amount column or separate debit / credit columns (header names are matched loosely).
 * Title rows above the real header are skipped, tabs without a table (summary tabs) are ignored.
 */

export type ImportDirection = "expense" | "income";
/** "external" = "חיצוני": a line that is neither income nor expense (trash) — never imported, only remembered. */
export type ImportSelection = "none" | "personal" | "business" | "external";

export type ParsedImportRow = {
  /** Original cells of the row (kept so the review table can show them as in the file). */
  cells: string[];
  isRed: boolean;
  sheet: string;
  date: string; // yyyy-mm-dd or ""
  dateText: string;
  desc: string;
  /** Who paid / who was paid (the name), "" when the file has no name for the line. Used for remembered rules. */
  payee: string;
  /** Always positive. 0 when the row has no usable amount. */
  amount: number;
  /** "אישי"/"עסק" already written in the file's own personal/business column (e.g. our exported workbook). */
  preSelection: ImportSelection;
  /** Direction implied by the file itself (debit/credit column or sign), or null when unknown. */
  direction: ImportDirection | null;
  amountText: string;
};

export type ParsedImportFile = {
  headers: string[];
  rows: ParsedImportRow[];
  sheetsUsed: string[];
  /** Human readable name of the layout that was recognised, for the review dialog. */
  layout: string;
  columns: ImportColumns;
};

export type ImportColumns = {
  date: number;
  desc: number;
  /** Single signed/unsigned amount column, -1 when the file has debit + credit columns. */
  amount: number;
  debit: number; // -1 = none
  credit: number; // -1 = none
  /** Column holding "אישי" / "עסק", -1 = none. */
  selection: number;
  /** Bank "פרטים" column ("המבצע: <name> עבור: <purpose>"), -1 = none. */
  details: number;
  /** Bank "לטובת" column (the other side's name), -1 = none. */
  payeeCol: number;
  /** Bank "עבור" column (what the payment was for), -1 = none. */
  purposeCol: number;
};

const DATE_WORDS = ["תאריך עסקה", "תאריך", "date"];
const DESC_WORDS = ["שם בית עסק", "בית העסק", "בית עסק", "תיאור הפעולה", "תיאור", "פירוט", "פעולה", "פרטים", "מוטב", "שם", "description"];
const DEBIT_WORDS = ["חובה", "הוצאה", "חיוב בש", "debit"];
const CREDIT_WORDS = ["זכות", "הכנסה", "זיכוי", "credit"];
const AMOUNT_WORDS = ["סכום חיוב", "סכום עסקה", "סכום", "חיוב", "amount", "₪"];

function headerCellMatches(cell: string, words: string[]): boolean {
  const c = cell.trim().toLowerCase();
  return !!c && words.some((w) => c.includes(w));
}

function findCol(headers: string[], words: string[], exclude: number[] = []): number {
  // earlier words win ("תאריך עסקה" before plain "תאריך"), so scan word-first
  for (const w of words) {
    const idx = headers.findIndex((h, i) => !exclude.includes(i) && headerCellMatches(h, [w]));
    if (idx >= 0) return idx;
  }
  return -1;
}

function rowHeaderScore(cells: string[]): number {
  // A real transactions table always has a date column; summary tabs ("חודש | הכנסות | הוצאות") do not.
  if (!cells.some((c) => headerCellMatches(c, DATE_WORDS))) return 0;
  let score = 1;
  if (cells.some((c) => headerCellMatches(c, DESC_WORDS))) score++;
  if (cells.some((c) => headerCellMatches(c, [...AMOUNT_WORDS, ...DEBIT_WORDS, ...CREDIT_WORDS]))) score++;
  return score;
}

export function guessColumns(headers: string[]): ImportColumns {
  const date = findCol(headers, DATE_WORDS);
  const used = date >= 0 ? [date] : [];
  const debit = findCol(headers, DEBIT_WORDS, used);
  const credit = findCol(headers, CREDIT_WORDS, used);
  const hasSplit = debit >= 0 && credit >= 0;
  // For the description prefer a header that is not the amount/debit/credit/date column.
  const excluded = [...used, debit, credit].filter((i) => i >= 0);
  const desc = findCol(headers, DESC_WORDS, excluded);
  const amount = hasSplit ? -1 : findCol(headers, AMOUNT_WORDS, [...excluded, desc].filter((i) => i >= 0));
  const selection = headers.findIndex((h) => h.includes("אישי") && h.includes("עסק"));
  const exactCol = (word: string) => headers.findIndex((h) => h.trim() === word);
  return {
    selection,
    details: exactCol("פרטים"),
    payeeCol: exactCol("לטובת"),
    purposeCol: exactCol("עבור"),
    date: Math.max(date, 0),
    desc: desc >= 0 ? desc : Math.min(1, Math.max(headers.length - 1, 0)),
    amount: hasSplit ? -1 : amount >= 0 ? amount : Math.min(2, Math.max(headers.length - 1, 0)),
    debit: hasSplit ? debit : -1,
    credit: hasSplit ? credit : -1,
  };
}

export function describeLayout(headers: string[], cols: ImportColumns): string {
  const has = (w: string) => headers.some((h) => h.includes(w));
  if (cols.debit >= 0 && cols.credit >= 0 && (has("יתרה") || has("אסמכתא"))) return "בנק הפועלים (עו״ש)";
  if (has("בית עסק") || has("בית העסק")) return "כרטיס אשראי (כאל / ישראכרט)";
  if (cols.debit >= 0 && cols.credit >= 0) return "דוח עם עמודות חובה / זכות";
  return "דוח כללי (תאריך, תיאור, סכום)";
}

/** Finds the real table in a sheet: skips title rows above it and returns null for tabs with no table. */
function findHeaderRow(rows: XlsxRow[]): number {
  const limit = Math.min(rows.length, 25);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const score = rowHeaderScore(rows[i].cells.map((c) => c.value));
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
    if (score === 3) return i;
  }
  return bestScore >= 2 ? best : -1;
}

function selCell(cells: string[], col: number): string {
  return col >= 0 ? (cells[col] ?? "").trim() : "";
}

function isRedCell(fill: string | null, isReddish: (a: string | null) => boolean) {
  return isReddish(fill);
}

/** Removes account / ID numbers ("מח-ן:000444610", "מזהה 322962580", any 8+ digit run) so they never land in a transaction name. */
function cleanName(text: string): string {
  return (text || "")
    .replace(/\s*(?:מח-ן|מזהה)\s*:?\s*\d+/g, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/[\s,]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Bank lines say only "זיכוי" / "העברה" in the operation column; the NAME sits in
 * "פרטים" ("המבצע: X עבור: Y" / "לטובת: X") or in the separate "לטובת" / "עבור" columns.
 * Returns the name and the purpose, both cleaned of account numbers.
 */
export function extractPayee(details: string, payeeCell: string, purposeCell: string): { payee: string; purpose: string } {
  const notId = (t: string) => !!t && !/^[\d\s-]+$/.test(t);
  let payee = cleanName(payeeCell);
  if (!notId(payee)) {
    const m = (details || "").match(/(?:המבצע|לטובת)\s*:\s*(.+?)(?:\s+עבור\s*:|$)/);
    payee = m ? cleanName(m[1]) : "";
    if (!notId(payee)) payee = "";
  }
  let purpose = cleanName(purposeCell);
  if (!purpose) {
    const m = (details || "").match(/עבור\s*:\s*(.*)$/);
    purpose = m ? cleanName(m[1]) : "";
  }
  if (purpose === payee) purpose = "";
  return { payee, purpose };
}

export function parseImportSheets(
  sheets: { name: string; rows: XlsxRow[] }[],
  isReddish: (argb: string | null) => boolean,
): ParsedImportFile | null {
  let headers: string[] | null = null;
  let columns: ImportColumns | null = null;
  const parsed: ParsedImportRow[] = [];
  const sheetsUsed: string[] = [];

  for (const sheet of sheets) {
    const h = findHeaderRow(sheet.rows);
    if (h < 0) continue;
    const sheetHeaders = sheet.rows[h].cells.map((c) => c.value.trim());
    const cols = guessColumns(sheetHeaders);
    // Later tabs must look like the first one (same date + description headers), otherwise they are some other table.
    if (headers && columns) {
      const same =
        (sheetHeaders[cols.date] || "") === (headers[columns.date] || "") &&
        (sheetHeaders[cols.desc] || "") === (headers[columns.desc] || "");
      if (!same) continue;
    } else {
      headers = sheetHeaders;
      columns = cols;
    }
    sheetsUsed.push(sheet.name);
    for (const r of sheet.rows.slice(h + 1)) {
      const cells = r.cells.map((c) => c.value);
      if (!cells.some((c) => c.trim() !== "")) continue;
      const dateText = (cells[cols.date] ?? "").trim();
      const date = parseDateCell(dateText) ?? "";
      const operation = (cells[cols.desc] ?? "").trim();
      const { payee, purpose } = extractPayee(
        cols.details >= 0 ? (cells[cols.details] ?? "") : "",
        cols.payeeCol >= 0 ? (cells[cols.payeeCol] ?? "") : "",
        cols.purposeCol >= 0 ? (cells[cols.purposeCol] ?? "") : "",
      );
      // With a name: "name · purpose". Without one (card charges, fees): the operation text as before.
      const desc = payee ? (purpose ? `${payee} · ${purpose}` : payee) : operation;
      // Skip total / blank-label rows that sit under the table ("סה״כ הכנסות" etc.).
      if (!date && (/^סה["״']?כ/.test(desc) || desc === "")) continue;
      let amount = 0;
      let direction: ImportDirection | null = null;
      let amountText = "";
      if (cols.debit >= 0 && cols.credit >= 0) {
        const d = parseAmountCell(cells[cols.debit] ?? "");
        const c = parseAmountCell(cells[cols.credit] ?? "");
        if (d > 0 && c === 0) {
          amount = d;
          direction = "expense";
          amountText = cells[cols.debit];
        } else if (c > 0 && d === 0) {
          amount = c;
          direction = "income";
          amountText = cells[cols.credit];
        } else if (d > 0 && c > 0) {
          // both filled (rare): net it
          amount = Math.abs(c - d);
          direction = c > d ? "income" : "expense";
          amountText = String(amount);
        }
      } else {
        const raw = cells[cols.amount] ?? "";
        amount = parseAmountCell(raw);
        amountText = raw;
        const cleaned = raw.replace(/[^\d.-]/g, "");
        const n = parseFloat(cleaned);
        if (Number.isFinite(n) && n < 0) direction = "expense";
        else if (Number.isFinite(n) && n > 0) direction = null; // positive: decided per file below
      }
      const selText = selCell(cells, cols.selection);
      parsed.push({
        preSelection: selText.startsWith("אישי") ? "personal" : selText.startsWith("עסק") ? "business" : selText.startsWith("חיצוני") ? "external" : "none",
        cells,
        isRed: r.cells.some((c) => isRedCell(c.fillArgb, isReddish)),
        sheet: sheet.name,
        date,
        dateText,
        desc,
        payee,
        amount,
        direction,
        amountText,
      });
    }
  }

  if (!headers || !columns) return null;

  // Single amount column: if the file has negative amounts at all, the sign tells the direction
  // (negative = expense, positive = income). Otherwise (e.g. a credit-card statement where
  // everything is a charge) every row defaults to expense.
  const isCardFile = headers.some((h) => h.includes("בית עסק") || h.includes("בית העסק"));
  if (columns.debit < 0) {
    if (isCardFile) {
      // Credit-card statement: a positive line is a charge (expense); only a NEGATIVE line (refund / credit)
      // is income. A single refund must not turn every charge in the file into income.
      for (const p of parsed) p.direction = p.direction === "expense" ? "income" : "expense";
    } else {
      const hasNegative = parsed.some((p) => p.direction === "expense");
      for (const p of parsed) {
        if (p.direction === null) p.direction = hasNegative ? "income" : "expense";
      }
    }
  }
  return { headers, rows: parsed, sheetsUsed, layout: describeLayout(headers, columns), columns };
}

// --------------------------------------------------------------------------
// Remembered "always" choices
// --------------------------------------------------------------------------

export type ImportRule = { selection: Exclude<ImportSelection, "none">; direction?: ImportDirection };
export type ImportRules = Record<string, ImportRule>;

/** Same payee written slightly differently each month ("PAYBOX 12/10", "פייבוקס שלי") must hit the same rule. */
export function payeeKey(desc: string): string {
  return (desc || "")
    .toLowerCase()
    .replace(/[0-9]+([./-][0-9]+)*/g, " ") // dates, ids, amounts
    .replace(/["'״׳`.,()*#\-_/\\:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const IMPORT_RULES_KEY = "finance_import_rules";

export function parseRules(value: string | null | undefined): ImportRules {
  if (!value) return {};
  try {
    const raw = JSON.parse(value) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: ImportRules = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const r = v as Partial<ImportRule> | null;
      if (r && (r.selection === "personal" || r.selection === "business" || r.selection === "external") && k) {
        out[k] = {
          selection: r.selection,
          ...(r.direction === "income" || r.direction === "expense" ? { direction: r.direction } : {}),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}
