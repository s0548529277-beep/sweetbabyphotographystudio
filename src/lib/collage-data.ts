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
];

/** One photo-slot's position, as a FRACTION (0-1) of the photo area — scaled to real pixels by the caller. */
export type SlotRect = { x: number; y: number; w: number; h: number };

/**
 * Fixed (not freely draggable/resizable) grid layouts per photo count —
 * the tradeoff that keeps this a realistic scope: every count from 1 to 7
 * gets one clean, pre-composed arrangement instead of a full drag/resize
 * canvas editor.
 */
export function layoutForCount(count: number): SlotRect[] {
  switch (count) {
    case 1:
      return [{ x: 0, y: 0, w: 1, h: 1 }];
    case 2:
      return [
        { x: 0, y: 0, w: 0.5, h: 1 },
        { x: 0.5, y: 0, w: 0.5, h: 1 },
      ];
    case 3:
      return [
        { x: 0, y: 0, w: 0.6, h: 1 },
        { x: 0.6, y: 0, w: 0.4, h: 0.5 },
        { x: 0.6, y: 0.5, w: 0.4, h: 0.5 },
      ];
    case 4:
      return [
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
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
    case 7:
    default: {
      const rects: SlotRect[] = [{ x: 0, y: 0, w: 1, h: 0.42 }];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) rects.push({ x: c / 3, y: 0.42 + r * 0.29, w: 1 / 3, h: 0.29 });
      return rects;
    }
  }
}
