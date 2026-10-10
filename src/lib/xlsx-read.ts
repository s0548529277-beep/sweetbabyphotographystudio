import JSZip from "jszip";

export type XlsxCell = { value: string; fillArgb: string | null };
export type XlsxRow = { cells: XlsxCell[] };

function textOf(el: Element | null | undefined): string {
  return el?.textContent ?? "";
}

/**
 * Very small, read-only .xlsx reader — just enough to pull cell values and
 * fill colors out of a simple spreadsheet (e.g. a bank statement export),
 * without pulling in a full Excel library (exceljs alone drags in ~170
 * transitive packages, most of them for writing/streaming we never need —
 * reading is what this app actually needs, so it's built directly on jszip,
 * already a dependency here for other features).
 *
 * An .xlsx file is a zip of XML parts; this reads exactly the three that
 * matter for "import this bank export, keep whichever rows she highlighted
 * red": shared strings (xl/sharedStrings.xml), cell styles — specifically
 * fill colors — (xl/styles.xml), and the first worksheet's cell data.
 */
export async function readXlsxFirstSheet(file: File | Blob): Promise<XlsxRow[]> {
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();

  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sharedStrings: string[] = [];
  if (sharedStringsXml) {
    const doc = parser.parseFromString(sharedStringsXml, "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      // A shared string can be a single <t>, or several <r><t> runs (rich text) — concatenate either way.
      const parts = Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "");
      sharedStrings.push(parts.join(""));
    }
  }

  const stylesXml = await zip.file("xl/styles.xml")?.async("string");
  const fillByXfIndex: (string | null)[] = [];
  if (stylesXml) {
    const doc = parser.parseFromString(stylesXml, "application/xml");
    const fillsEl = doc.getElementsByTagName("fills")[0];
    const fills = fillsEl ? Array.from(fillsEl.getElementsByTagName("fill")) : [];
    const fillArgbByFillId: (string | null)[] = fills.map((fill) => {
      const pattern = fill.getElementsByTagName("patternFill")[0];
      if (!pattern || pattern.getAttribute("patternType") !== "solid") return null;
      const fg = pattern.getElementsByTagName("fgColor")[0];
      return fg?.getAttribute("rgb") ?? null;
    });
    const cellXfsEl = doc.getElementsByTagName("cellXfs")[0];
    const xfs = cellXfsEl ? Array.from(cellXfsEl.getElementsByTagName("xf")) : [];
    for (const xf of xfs) {
      const fillId = Number(xf.getAttribute("fillId") ?? "0");
      fillByXfIndex.push(fillArgbByFillId[fillId] ?? null);
    }
  }

  // Resolve the first worksheet's actual file path via workbook.xml + its
  // rels — usually xl/worksheets/sheet1.xml, but following the declared
  // sheet order is more correct than guessing the filename.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (workbookXml && relsXml) {
    const wbDoc = parser.parseFromString(workbookXml, "application/xml");
    const firstSheet = wbDoc.getElementsByTagName("sheet")[0];
    const rId = firstSheet?.getAttribute("r:id");
    if (rId) {
      const relsDoc = parser.parseFromString(relsXml, "application/xml");
      const rel = Array.from(relsDoc.getElementsByTagName("Relationship")).find(
        (r) => r.getAttribute("Id") === rId,
      );
      const target = rel?.getAttribute("Target");
      if (target) sheetPath = `xl/${target.replace(/^\/?xl\//, "")}`;
    }
  }

  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) return [];
  const doc = parser.parseFromString(sheetXml, "application/xml");
  const rows: XlsxRow[] = [];
  for (const rowEl of Array.from(doc.getElementsByTagName("row"))) {
    const cells: XlsxCell[] = [];
    for (const cEl of Array.from(rowEl.getElementsByTagName("c"))) {
      const colLetters = (cEl.getAttribute("r") ?? "").match(/^[A-Z]+/)?.[0] ?? "";
      const colIndex = colLetters.split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const type = cEl.getAttribute("t");
      const styleIdx = Number(cEl.getAttribute("s") ?? "0");
      let value = "";
      if (type === "inlineStr") {
        value = textOf(cEl.getElementsByTagName("t")[0]);
      } else {
        const raw = textOf(cEl.getElementsByTagName("v")[0]);
        value = type === "s" ? (sharedStrings[Number(raw)] ?? "") : raw;
      }
      if (colIndex >= 0) {
        cells[colIndex] = { value, fillArgb: fillByXfIndex[styleIdx] ?? null };
      }
    }
    // Fill gaps (columns with no <c> element at all) so every row has a stable column count.
    for (let i = 0; i < cells.length; i++) if (!cells[i]) cells[i] = { value: "", fillArgb: null };
    rows.push({ cells });
  }
  return rows;
}

/**
 * Excel fill colors are 8-char ARGB hex — true if the color reads as "red"
 * to a human eye (dominant red channel), covering both a plain red swatch
 * (e.g. FFFF0000, FFC00000) and Excel's pastel "light red fill" conditional-
 * formatting preset (FFFFC7CE).
 */
export function isReddishArgb(argb: string | null): boolean {
  if (!argb || argb.length < 6) return false;
  const hex = argb.slice(-6);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  return r > 100 && r - Math.max(g, b) > 40;
}

/** A bank export's amount column is rarely a clean number — strips currency symbols/commas and returns the absolute value (expenses are always stored positive in this app). */
export function parseAmountCell(raw: string): number {
  const cleaned = (raw || "").replace(/[^\d.-]/g, "");
  const n = Math.abs(parseFloat(cleaned));
  return Number.isFinite(n) ? n : 0;
}

/** Normalizes a date cell to yyyy-mm-dd — handles an already-ISO value, Israeli dd/mm/yyyy (or dd.mm.yyyy), and a raw Excel serial date number (days since 1899-12-30, Excel's epoch). Returns null if nothing recognizable was found. */
export function parseDateCell(raw: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const serial = Number(value);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + serial * 86400000).toISOString().slice(0, 10);
  }
  return null;
}
