/**
 * Data + pure layout math for the free public collage/greeting-card maker
 * (/collage-maker). No secrets, no server dependency — this whole feature
 * runs entirely client-side (uploaded photos never leave the browser; the
 * final card is rasterized and downloaded locally, nothing is stored).
 */

export type CollageStyleId = "minimal" | "luxury" | "floral";

export type CollageStyle = {
  id: CollageStyleId;
  label: string;
  bg: string;
  panelBg: string;
  accent: string;
  captionColor: string;
  fontFamily: string;
  /** Simple corner flourish — kept intentionally light (a few SVG shapes), not a full sticker library. */
  decorative: boolean;
};

export const COLLAGE_STYLES: CollageStyle[] = [
  {
    id: "minimal",
    label: "נקי מינימליסטי",
    bg: "#ffffff",
    panelBg: "#ffffff",
    accent: "#2d2d2d",
    captionColor: "#1f1f1f",
    fontFamily: "Assistant, sans-serif",
    decorative: false,
  },
  {
    id: "luxury",
    label: "יוקרתי",
    bg: "#1c1a17",
    panelBg: "#221f1b",
    accent: "#d4af6a",
    captionColor: "#f3e6cf",
    fontFamily: "'DM Serif Display', serif",
    decorative: true,
  },
  {
    id: "floral",
    label: "פרחוני",
    bg: "#fdf3f0",
    panelBg: "#fffaf8",
    accent: "#c9738f",
    captionColor: "#7a3c52",
    fontFamily: "'DM Serif Display', serif",
    decorative: true,
  },
];

export function findCollageStyle(id: CollageStyleId): CollageStyle {
  return COLLAGE_STYLES.find((s) => s.id === id) ?? COLLAGE_STYLES[0];
}

export type CollageOccasionId = "birthday1" | "newborn" | "chalaka" | "lifestyle" | "batmitzvah" | "wedding";

export type CollageOccasion = {
  id: CollageOccasionId;
  label: string;
  style: CollageStyleId;
  caption: string;
  subtitle?: string;
  photoCount: number;
};

// "Ready-made" starting points, per explicit request — picking one just
// pre-fills style/caption/subtitle/photo-count; every field stays editable
// afterward, nothing is locked in.
export const COLLAGE_OCCASIONS: CollageOccasion[] = [
  { id: "birthday1", label: "גיל שנה", style: "floral", caption: "יש לי מלכה", subtitle: "אני בת שנה 🎂", photoCount: 3 },
  { id: "newborn", label: "ניו-בורן", style: "minimal", caption: "ברוכים הבאים", subtitle: "הצטרפ/ה אלינו", photoCount: 1 },
  { id: "chalaka", label: "חלאקה", style: "luxury", caption: "החלאקה שלי", subtitle: "שלוש שנים מלאות אהבה", photoCount: 4 },
  { id: "lifestyle", label: "לייפסטייל", style: "minimal", caption: "רגעים שנשארים", photoCount: 5 },
  { id: "batmitzvah", label: "בת מצווה", style: "luxury", caption: "בת מצווה שמחה", photoCount: 3 },
  { id: "wedding", label: "חתונה", style: "luxury", caption: "מזל טוב", subtitle: "לחיים ולאושר", photoCount: 2 },
];

// Preset captions, grouped — a starting library, not exhaustive; the free
// text field covers everything else. Invented per explicit request
// ("תמציא"), inspired by common Israeli greeting-card phrasing.
export const CAPTION_GROUPS: { group: string; items: string[] }[] = [
  { group: "חגים", items: ["שנה טובה", "פורים שמח", "חג שמח", "חג פסח שמח", "חנוכה שמח", "חג סוכות שמח", "שבת שלום"] },
  { group: "איחולים", items: ["טיסה נעימה", "בהצלחה", "מזל טוב", "איחולים חמים", "בשעה טובה", "דרך צלחה"] },
  {
    group: "אבני דרך",
    items: ["אני בן 3", "אני בת 3", "יום הולדת שמח", "החלאקה שלי", "הצעד הראשון שלי", "התחלתי גן", "ברוכים הבאים לעולם"],
  },
  { group: "משפחה", items: ["להורים הכי טובים בעולם", "לסבא ולסבתא האהובים", "המשפחה שלנו", "אנחנו משפחה", "ביחד זה הכי טוב"] },
  {
    group: "ניו-בורן",
    items: ["נולדתי", "ברוכה הבאה לעולם", "ברוך הבא לעולם", "המלכה הקטנה שלנו", "הנסיך הקטן שלנו", "עוד קצת ונתאהב"],
  },
  { group: "חלאקה", items: ["החלאקה שלי", "הגיע הזמן לתספורת", "שלוש שנות אהבה", "מהיום קטן וגדול"] },
];

/** Preset color combinations — an alternative starting point to the fixed per-style palette; picking one overrides the current style's bg/accent/captionColor (see paletteOverride on CollageCard) while everything else about the style (font, decorative frame) stays. */
export type ColorPalette = { id: string; label: string; bg: string; accent: string; captionColor: string };

export const COLOR_PALETTES: ColorPalette[] = [
  { id: "blush", label: "רוד עדין", bg: "#fdf1f0", accent: "#d98a92", captionColor: "#7a3540" },
  { id: "sage", label: "ירוק מרווה", bg: "#f3f6f1", accent: "#7c9473", captionColor: "#3c4a36" },
  { id: "navy-gold", label: "נייבי וזהב", bg: "#12203a", accent: "#d4af6a", captionColor: "#f3e6cf" },
  { id: "terracotta", label: "טרה-קוטה", bg: "#fbf1e9", accent: "#c1652f", captionColor: "#5a2c14" },
  { id: "ocean", label: "כחול אוקיינוס", bg: "#eef6f8", accent: "#2f7f95", captionColor: "#123844" },
  { id: "lavender", label: "לבנדר", bg: "#f6f2fb", accent: "#8c6fb0", captionColor: "#3f2c56" },
  { id: "mono", label: "שחור-לבן קלאסי", bg: "#ffffff", accent: "#1a1a1a", captionColor: "#1a1a1a" },
  { id: "sunset", label: "שקיעה", bg: "#fff4ea", accent: "#e0763f", captionColor: "#7a3110" },
];

/** Themed decorative-element overlays, keyed to match the occasion ids they're most relevant for ("an option to add elements by theme") — but offered as an independent toggle, not tied to picking that occasion preset. Actual SVG rendering lives in CollageCard (it's JSX, not data). */
export type DecorThemeId = "none" | "birthday1" | "newborn" | "chalaka";

export const DECOR_THEMES: { id: DecorThemeId; label: string }[] = [
  { id: "none", label: "ללא" },
  { id: "birthday1", label: "גיל שנה" },
  { id: "newborn", label: "ניו-בורן" },
  { id: "chalaka", label: "חלאקה" },
];

/** One photo-slot's position, as a FRACTION (0-1) of the photo area — scaled to real pixels by the caller. */
export type SlotRect = { x: number; y: number; w: number; h: number };

/**
 * "Featured" layouts — one hand-composed arrangement per photo count, each
 * giving one photo visual emphasis (a big frame + smaller ones), rather
 * than a plain grid. Paired with equalGridLayout below as the second
 * option every count offers — see getLayoutVariants.
 */
function featuredLayout(count: number): SlotRect[] {
  switch (count) {
    case 1:
      return [{ x: 0, y: 0, w: 1, h: 1 }];
    case 2:
      // Stacked top/bottom — deliberately different from the grid variant's
      // side-by-side split, so the two options actually look distinct.
      return [
        { x: 0, y: 0, w: 1, h: 0.55 },
        { x: 0, y: 0.55, w: 1, h: 0.45 },
      ];
    case 3:
      return [
        { x: 0, y: 0, w: 0.6, h: 1 },
        { x: 0.6, y: 0, w: 0.4, h: 0.5 },
        { x: 0.6, y: 0.5, w: 0.4, h: 0.5 },
      ];
    case 4:
      return [
        { x: 0, y: 0, w: 1, h: 0.55 },
        { x: 0, y: 0.55, w: 1 / 3, h: 0.45 },
        { x: 1 / 3, y: 0.55, w: 1 / 3, h: 0.45 },
        { x: 2 / 3, y: 0.55, w: 1 / 3, h: 0.45 },
      ];
    case 5:
      return [
        { x: 0, y: 0, w: 0.6, h: 0.6 },
        { x: 0.6, y: 0, w: 0.4, h: 0.3 },
        { x: 0.6, y: 0.3, w: 0.4, h: 0.3 },
        { x: 0, y: 0.6, w: 0.5, h: 0.4 },
        { x: 0.5, y: 0.6, w: 0.5, h: 0.4 },
      ];
    case 6: {
      const rects: SlotRect[] = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) rects.push({ x: c / 3, y: r * 0.5, w: 1 / 3, h: 0.5 });
      return rects;
    }
    case 7: {
      const rects: SlotRect[] = [{ x: 0, y: 0, w: 1, h: 0.42 }];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) rects.push({ x: c / 3, y: 0.42 + r * 0.29, w: 1 / 3, h: 0.29 });
      return rects;
    }
    default: {
      // Past 7, hand-authoring every arrangement stops paying off — one big
      // photo on top, the rest tiled as evenly as possible below it. Still
      // visually distinct from the plain equal grid thanks to the big top
      // photo, and works for any count without a new special case.
      const restCount = count - 1;
      const rows = Math.max(1, Math.round(Math.sqrt(restCount)));
      const baseCols = Math.floor(restCount / rows);
      const extraRows = restCount % rows;
      const topH = 0.38;
      const rowH = (1 - topH) / rows;
      const rects: SlotRect[] = [{ x: 0, y: 0, w: 1, h: topH }];
      for (let r = 0; r < rows; r++) {
        const cols = r < extraRows ? baseCols + 1 : baseCols;
        if (cols <= 0) continue;
        const colW = 1 / cols;
        for (let c = 0; c < cols; c++) rects.push({ x: c * colW, y: topH + r * rowH, w: colW, h: rowH });
      }
      return rects;
    }
  }
}

/**
 * Asymmetric "mosaic" tiling via recursive binary splitting (a small
 * treemap) — each split's ratio is nudged off dead-center and the split
 * axis alternates with recursion depth, so the result reads as an
 * irregular Pinterest-board-style mosaic rather than a disguised grid.
 * Deterministic (no Math.random) so the same photo count always produces
 * the same layout across re-renders. Works for any count.
 */
function mosaicLayout(count: number): SlotRect[] {
  function split(n: number, x: number, y: number, w: number, h: number, axis: "h" | "v", depth: number): SlotRect[] {
    if (n <= 1) return [{ x, y, w, h }];
    const firstN = Math.ceil(n / 2);
    const secondN = n - firstN;
    const bias = depth % 2 === 0 ? 0.07 : -0.07;
    const ratio = Math.min(0.72, Math.max(0.28, firstN / n + bias));
    const nextAxis = axis === "h" ? "v" : "h";
    if (axis === "h") {
      const w1 = w * ratio;
      return [...split(firstN, x, y, w1, h, nextAxis, depth + 1), ...split(secondN, x + w1, y, w - w1, h, nextAxis, depth + 1)];
    }
    const h1 = h * ratio;
    return [...split(firstN, x, y, w, h1, nextAxis, depth + 1), ...split(secondN, x, y + h1, w, h - h1, nextAxis, depth + 1)];
  }
  return split(count, 0, 0, 1, 1, "h", 0);
}

/** A near-square grid of equal cells for ANY count — computed, not hand-authored, so it works for every photo count without a special case. */
function equalGridLayout(count: number): SlotRect[] {
  if (count <= 1) return featuredLayout(1);
  const rows = Math.max(1, Math.round(Math.sqrt(count)));
  const baseCols = Math.floor(count / rows);
  const extraRows = count % rows; // this many rows get one extra column
  const rowH = 1 / rows;
  const rects: SlotRect[] = [];
  for (let r = 0; r < rows; r++) {
    const cols = r < extraRows ? baseCols + 1 : baseCols;
    if (cols <= 0) continue;
    const colW = 1 / cols;
    for (let c = 0; c < cols; c++) rects.push({ x: c * colW, y: r * rowH, w: colW, h: rowH });
  }
  return rects;
}

/** Full-width equal vertical strips — a third, simple option for smaller counts (gets visually thin past ~5, so only offered up to 5). */
function stripLayout(count: number): SlotRect[] {
  const w = 1 / count;
  return Array.from({ length: count }, (_, i) => ({ x: i * w, y: 0, w, h: 1 }));
}

export type LayoutVariant = { id: string; label: string; rects: SlotRect[] };

/**
 * Every layout option offered for a given photo count — "featured" (one
 * emphasized photo) and "grid" (equal cells) always; "strip" (equal
 * columns) added for counts small enough that it still reads well. Fixed,
 * pre-composed arrangements — not a freeform drag/resize canvas — is the
 * deliberate scope tradeoff that keeps this buildable; see collage-
 * maker.tsx's own top comment.
 */
export function getLayoutVariants(count: number): LayoutVariant[] {
  if (count <= 1) return [{ id: "featured", label: "יחיד", rects: featuredLayout(1) }];
  const variants: LayoutVariant[] = [
    { id: "featured", label: "מודגש", rects: featuredLayout(count) },
    { id: "grid", label: "רשת", rects: equalGridLayout(count) },
  ];
  if (count <= 5) variants.push({ id: "strip", label: "פסים", rects: stripLayout(count) });
  if (count >= 3) variants.push({ id: "mosaic", label: "מוזאיקה א-סימטרית", rects: mosaicLayout(count) });
  return variants;
}

export type PhotoShapeId = "rect" | "rounded" | "circle" | "arch" | "heart";

export const PHOTO_SHAPES: { id: PhotoShapeId; label: string }[] = [
  { id: "rect", label: "מלבן" },
  { id: "rounded", label: "פינות מעוגלות" },
  { id: "circle", label: "עיגול" },
  { id: "arch", label: "קשת" },
  { id: "heart", label: "לב" },
];

export type PhotoEffectId = "none" | "bw" | "warm" | "vivid" | "soft";

/** cssFilter is applied to each <image> via the SVG filter attribute — same CSS filter() functions the browser already knows, so it rasterizes correctly with no extra work. */
export const PHOTO_EFFECTS: { id: PhotoEffectId; label: string; cssFilter: string }[] = [
  { id: "none", label: "רגיל", cssFilter: "" },
  { id: "bw", label: "שחור-לבן", cssFilter: "grayscale(1) contrast(1.05)" },
  { id: "warm", label: "וינטג׳ חם", cssFilter: "sepia(0.35) saturate(1.2) contrast(1.05)" },
  { id: "vivid", label: "חי וצבעוני", cssFilter: "saturate(1.6) contrast(1.12)" },
  { id: "soft", label: "רך ובהיר", cssFilter: "brightness(1.08) saturate(0.85) contrast(0.95)" },
];

// Heart outline, sampled from the classic parametric heart curve
// x=16sin³t, y=13cos t − 5cos 2t − 2cos 3t − cos 4t, then normalized into a
// 0..1 unit box (with a small inset so the point doesn't touch the slot
// edges) — computed once at module load, reused as a plain point list
// (straight segments read plenty smooth at collage scale, no need for
// hand-tuned beziers).
const HEART_STEPS = 48;
const HEART_RAW: [number, number][] = Array.from({ length: HEART_STEPS }, (_, i) => {
  const t = (i / HEART_STEPS) * Math.PI * 2;
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return [x, y];
});
const HEART_MIN_X = Math.min(...HEART_RAW.map((p) => p[0]));
const HEART_MAX_X = Math.max(...HEART_RAW.map((p) => p[0]));
const HEART_MIN_Y = Math.min(...HEART_RAW.map((p) => p[1]));
const HEART_MAX_Y = Math.max(...HEART_RAW.map((p) => p[1]));
// Note the flipped y mapping: the curve's most-NEGATIVE y is its bottom
// cusp, and we want that cusp at the BOTTOM of the box (large SVG y).
const HEART_UNIT: [number, number][] = HEART_RAW.map(([x, y]) => [
  0.04 + (0.92 * (x - HEART_MIN_X)) / (HEART_MAX_X - HEART_MIN_X),
  0.02 + (0.94 * (HEART_MAX_Y - y)) / (HEART_MAX_Y - HEART_MIN_Y),
]);

/**
 * The clip path `d` string for one photo slot, in its given shape — "rect"
 * needs no clipping (returns null, caller skips the clipPath entirely).
 * "arch" is the classic rounded-top/flat-bottom doorway shape; its radius
 * is capped at the slot's own height so a short, wide slot doesn't produce
 * an impossible arc. "heart" maps the precomputed unit-box point list onto
 * the slot rect and joins it as a straight-segment polygon.
 */
export function shapeClipPath(shape: PhotoShapeId, rect: SlotRect): string | null {
  const { x, y, w, h } = rect;
  switch (shape) {
    case "heart": {
      const pts = HEART_UNIT.map(([nx, ny]) => `${x + nx * w},${y + ny * h}`);
      return `M ${pts[0]} L ${pts.slice(1).join(" L ")} Z`;
    }
    case "rounded": {
      const r = Math.min(w, h) * 0.08;
      return `M ${x + r},${y} H ${x + w - r} A ${r},${r} 0 0 1 ${x + w},${y + r} V ${y + h - r} A ${r},${r} 0 0 1 ${x + w - r},${y + h} H ${x + r} A ${r},${r} 0 0 1 ${x},${y + h - r} V ${y + r} A ${r},${r} 0 0 1 ${x + r},${y} Z`;
    }
    case "circle": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      return `M ${cx - r},${cy} A ${r},${r} 0 1 1 ${cx + r},${cy} A ${r},${r} 0 1 1 ${cx - r},${cy} Z`;
    }
    case "arch": {
      const r = Math.min(w / 2, h);
      return `M ${x},${y + h} L ${x},${y + r} A ${r},${r} 0 0 1 ${x + w},${y + r} L ${x + w},${y + h} Z`;
    }
    case "rect":
    default:
      return null;
  }
}
