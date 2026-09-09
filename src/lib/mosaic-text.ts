/**
 * Core, framework-free generator for the "טקסט מתמונות" (photo mosaic
 * text) tool at /collage-text — a word/phrase where every letter is
 * "filled" with a mosaic of the user's own uploaded photos, the same
 * general idea as the existing /collage-maker and /collage-studio but the
 * output shape is dictated by text glyphs instead of a fixed layout.
 * Entirely client-side (canvas 2D only) — no photo ever leaves the
 * browser, consistent with every other tool on this site.
 *
 * Pipeline (see buildMosaic, the single entry point):
 *   1. Rasterize the text to a smooth alpha mask (drawTextMask).
 *   2. Walk a TILE×TILE grid over the mask; a cell is "inside" the letters
 *      once its average alpha coverage clears a threshold (activeCells).
 *   3. Assign one prepared (pre-cropped-to-square) photo to each active
 *      cell, avoiding repeating the immediate left/top neighbor's photo
 *      (assignPhotos).
 *   4. Paint each cell's photo into a full-resolution result canvas, then
 *      cut it down to the exact letter shape using the ORIGINAL smooth
 *      mask (not the blocky grid) via destination-in compositing, so
 *      letter edges stay smooth instead of stair-stepped.
 *   5. Composite over the chosen background (or leave transparent for
 *      PNG) and return the finished canvas — the caller turns that into a
 *      downloadable file exactly like the other collage tools already do.
 */

export type MosaicBackground = { kind: "color"; color: string } | { kind: "transparent" };

export type MosaicOptions = {
  text: string;
  fontFamily: string;
  /** CSS font-weight to pair with fontFamily — a heavy weight (700-900) matters a lot here: thin strokes leave too few/too-thin cells to read as letters once broken into a photo grid. */
  fontWeight?: string;
  /** Final canvas size in CSS-ish px — the function itself upscales internally for anti-aliasing (see SUPERSAMPLE), so pass the size you want the *design* to read as, not the literal output resolution. */
  width: number;
  height: number;
  /** How many tile columns should span the text's own width — the resolution/repetition trade-off from the spec (15-40 is a good range: fewer = each photo more recognizable but fewer total pieces, more = finer mosaic but each photo shows as a smaller square). */
  cols: number;
  background: MosaicBackground;
  /** Fraction (0-1) of a cell's own pixels that must be inside the text for that cell to get a photo. 0.35 matches the spec. */
  threshold?: number;
};

export type PreparedPhoto = { id: string; bitmap: ImageBitmap };

// Renders everything at 2x the requested design size — cheap, real
// anti-aliasing insurance for both the text mask's edges and the final
// exported file (the other collage tools on this site use the same
// "render bigger, downscale never needed because we just keep the bigger
// canvas" trick for their own PNG exports).
const SUPERSAMPLE = 2;

/**
 * Loads one uploaded photo (as a data: URL) and returns it pre-cropped to
 * a square ImageBitmap at a fixed working resolution — cached by the
 * caller so re-rendering the mosaic (e.g. after moving the tile-size
 * slider) never re-decodes or re-crops the same photo twice.
 */
export async function prepareSquarePhoto(id: string, dataUrl: string, size = 320): Promise<PreparedPhoto> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("טעינת התמונה נכשלה"));
    el.src = dataUrl;
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight) || 1;
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas לא נתמך בדפדפן הזה");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const bitmap = await createImageBitmap(canvas);
  return { id, bitmap };
}

/** Draws the text centered on a fresh canvas at the given pixel size and returns both the canvas (used later as the exact-edge alpha mask) and the tight bounding box the text actually occupies within it (used to size the tile grid to the text's own footprint, not the whole canvas). */
async function drawTextMask(text: string, fontFamily: string, fontWeight: string, w: number, h: number): Promise<{ canvas: HTMLCanvasElement; bounds: { x: number; y: number; w: number; h: number } }> {
  try {
    await document.fonts.ready;
  } catch {
    // best effort — proceed with whatever's already loaded
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas לא נתמך בדפדפן הזה");

  const padding = w * 0.06;
  const targetW = w - padding * 2;
  const cx = w / 2;
  const cy = h / 2;

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000000";

  // Binary-search the font size that makes the text's own measured width
  // (via measureText, not a guessed char-count heuristic — this is what
  // actually differs per font/glyph) fill the available width.
  let lo = 10;
  let hi = h * 1.8;
  const measureAt = (size: number) => {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (measureAt(mid) > targetW) hi = mid;
    else lo = mid;
  }
  const fontSize = lo;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillText(text, cx, cy);

  // Real bounding box from the metrics the browser just measured — not an
  // assumption from the font size — so the grid below hugs the glyphs
  // instead of the whole canvas (empty ascender/descender space around a
  // short word would otherwise waste a lot of the tile budget on nothing).
  const m = ctx.measureText(text);
  const boundsW = (m.actualBoundingBoxLeft ?? targetW / 2) + (m.actualBoundingBoxRight ?? targetW / 2);
  const boundsH = (m.actualBoundingBoxAscent ?? fontSize / 2) + (m.actualBoundingBoxDescent ?? fontSize / 2);
  const bounds = {
    x: Math.max(0, cx - boundsW / 2 - padding * 0.15),
    y: Math.max(0, cy - (m.actualBoundingBoxAscent ?? fontSize / 2) - padding * 0.15),
    w: Math.min(w, boundsW + padding * 0.3),
    h: Math.min(h, boundsH + padding * 0.3),
  };
  return { canvas, bounds };
}

type Cell = { row: number; col: number; x: number; y: number; size: number };

/** Every grid cell whose average mask coverage clears the threshold — the actual mosaic footprint. */
function activeCells(maskCtx: CanvasRenderingContext2D, bounds: { x: number; y: number; w: number; h: number }, tile: number, threshold: number): Cell[] {
  const cols = Math.max(1, Math.ceil(bounds.w / tile));
  const rows = Math.max(1, Math.ceil(bounds.h / tile));
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round(bounds.x + col * tile);
      const y = Math.round(bounds.y + row * tile);
      const cw = Math.min(tile, bounds.x + bounds.w - x);
      const ch = Math.min(tile, bounds.y + bounds.h - y);
      if (cw <= 0 || ch <= 0) continue;
      const data = maskCtx.getImageData(x, y, Math.max(1, Math.round(cw)), Math.max(1, Math.round(ch))).data;
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) sum += data[i];
      const coverage = sum / (255 * (data.length / 4));
      if (coverage >= threshold) cells.push({ row, col, x, y, size: tile });
    }
  }
  return cells;
}

/** Cheap deterministic pseudo-random in [0,1) — same trick used elsewhere in this codebase's collage tools (collage-data.ts's scatter layout) so re-rendering with the same inputs gives the same result instead of reshuffling every time. */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Assigns one photo id to each active cell, row-major, never repeating the cell directly to its right or directly below (i.e. checked against the already-assigned left/top neighbor) when more than one photo is available — the spec's "no identical copies touching" rule. */
function assignPhotos(cells: Cell[], photoIds: string[]): Map<string, string> {
  const byPos = new Map<string, Cell>();
  for (const c of cells) byPos.set(`${c.row}:${c.col}`, c);
  const assignment = new Map<string, string>(); // "row:col" -> photoId
  cells.forEach((c, i) => {
    const leftId = assignment.get(`${c.row}:${c.col - 1}`);
    const topId = assignment.get(`${c.row - 1}:${c.col}`);
    let pick = photoIds[Math.floor(seededRand(i * 7 + 1) * photoIds.length)];
    if (photoIds.length > 1) {
      let attempts = 0;
      while ((pick === leftId || pick === topId) && attempts < 8) {
        pick = photoIds[Math.floor(seededRand(i * 7 + 1 + attempts * 3.7) * photoIds.length)];
        attempts++;
      }
    }
    assignment.set(`${c.row}:${c.col}`, pick);
  });
  return assignment;
}

export async function buildMosaic(opts: MosaicOptions, photos: PreparedPhoto[]): Promise<HTMLCanvasElement> {
  if (photos.length === 0) throw new Error("צריך להעלות לפחות תמונה אחת");
  const w = Math.round(opts.width * SUPERSAMPLE);
  const h = Math.round(opts.height * SUPERSAMPLE);
  const { canvas: mask, bounds } = await drawTextMask(opts.text || " ", opts.fontFamily, opts.fontWeight ?? "900", w, h);
  const maskCtx = mask.getContext("2d")!;

  const cols = Math.max(4, Math.round(opts.cols));
  const tile = Math.max(4, bounds.w / cols);
  const threshold = opts.threshold ?? 0.35;
  const cells = activeCells(maskCtx, bounds, tile, threshold);
  if (cells.length === 0) throw new Error("לא נמצא טקסט לצייר — נסי מילה אחרת או קנבס גדול יותר");

  const photoIds = photos.map((p) => p.id);
  const byId = new Map(photos.map((p) => [p.id, p.bitmap]));
  const assignment = assignPhotos(cells, photoIds);

  // 1) Paint every cell's photo onto a plain (unmasked) result canvas.
  const painted = document.createElement("canvas");
  painted.width = w;
  painted.height = h;
  const pctx = painted.getContext("2d")!;
  pctx.imageSmoothingEnabled = true;
  pctx.imageSmoothingQuality = "high";
  let n = 0;
  for (const c of cells) {
    const id = assignment.get(`${c.row}:${c.col}`)!;
    const bmp = byId.get(id);
    if (bmp) pctx.drawImage(bmp, c.x, c.y, c.size, c.size);
    // Yield back to the browser every couple hundred cells on a big grid
    // so the tab stays responsive instead of freezing mid-render.
    n++;
    if (n % 250 === 0) await new Promise((r) => requestAnimationFrame(r));
  }

  // 2) Cut the painted mosaic down to the smooth original text shape.
  pctx.globalCompositeOperation = "destination-in";
  pctx.drawImage(mask, 0, 0);
  pctx.globalCompositeOperation = "source-over";

  // 3) Composite over the chosen background.
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  if (opts.background.kind === "color") {
    octx.fillStyle = opts.background.color;
    octx.fillRect(0, 0, w, h);
  }
  octx.drawImage(painted, 0, 0);
  return out;
}
