/**
 * Background swatches / patterns + sticker library for the free collage
 * maker. Everything here is plain data (colors, pattern ids, sticker ids
 * and Hebrew caption strings) — the actual drawing lives in
 * CollageCard.tsx's <Sticker /> so the same shapes render both in the live
 * preview and in the exported PNG/JPG (no external images, nothing that
 * could taint the export canvas).
 */

/** Flat swatch grid, in the warm boutique range the studio uses. */
export const BACKGROUND_SWATCHES: string[] = [
  "#e2624a", "#ef6c57", "#f2988e", "#f6bcb4", "#f7d9cf", "#e6d3bd", "#fdf6ee", "#ffffff",
  "#5a9a4e", "#9cc45a", "#dbe9a8", "#f6e58a", "#f4c534", "#f0a92c", "#e04a7a", "#c9436b",
  "#4f83d6", "#9dc4ef", "#cfe4f7", "#2c6b74", "#7ecfc0", "#bfe8d8", "#2f6b3a", "#2d3d2b",
  "#9c8974", "#c3ac93", "#e4d6c3", "#3e3559", "#6a5aa0", "#b1a2e0", "#ded6f7", "#3b4bb0",
  "#2f3440", "#f5c95b", "#9ab6b8", "#e79274", "#9aa0a6", "#1c1c1c", "#3b342e", "#6b5545",
  "#f39170", "#dcc8ae", "#b9c7ef", "#8fb99a", "#f6c3ce", "#c9a7e6", "#a9cf74", "#f593b6",
];

export type BackgroundPatternId = "none" | "stripes" | "diagonal" | "dots" | "dots-pink" | "grid" | "confetti";

export const BACKGROUND_PATTERNS: { id: BackgroundPatternId; label: string }[] = [
  { id: "none", label: "חלק" },
  { id: "stripes", label: "פסים" },
  { id: "diagonal", label: "אלכסונים" },
  { id: "dots", label: "נקודות" },
  { id: "dots-pink", label: "נקודות ורודות" },
  { id: "grid", label: "משבצות" },
  { id: "confetti", label: "קונפטי" },
];

export type StickerKind =
  | "heart-pink"
  | "heart-red"
  | "heart-outline"
  | "hearts-trio"
  | "flower-yellow"
  | "flower-purple"
  | "flower-pink"
  | "bouquet"
  | "sparkle"
  | "star"
  | "bee"
  | "honey"
  | "apple"
  | "pomegranate"
  | "leaf"
  | "balloon"
  | "cloud"
  | "moon"
  | "crown"
  | "bow"
  | "pacifier"
  | "footprint";

export const STICKERS: { id: StickerKind; label: string }[] = [
  { id: "heart-pink", label: "לב ורוד" },
  { id: "heart-red", label: "לב אדום" },
  { id: "heart-outline", label: "לב קו" },
  { id: "hearts-trio", label: "שלושה לבבות" },
  { id: "flower-yellow", label: "פרח צהוב" },
  { id: "flower-purple", label: "פרח סגול" },
  { id: "flower-pink", label: "פרח ורוד" },
  { id: "bouquet", label: "זר פרחים" },
  { id: "sparkle", label: "נצנוץ" },
  { id: "star", label: "כוכב" },
  { id: "bee", label: "דבורה" },
  { id: "honey", label: "צנצנת דבש" },
  { id: "apple", label: "תפוח" },
  { id: "pomegranate", label: "רימון" },
  { id: "leaf", label: "עלה" },
  { id: "balloon", label: "בלון" },
  { id: "cloud", label: "ענן" },
  { id: "moon", label: "ירח" },
  { id: "crown", label: "כתר" },
  { id: "bow", label: "פפיון" },
  { id: "pacifier", label: "מוצץ" },
  { id: "footprint", label: "כף רגל" },
];

/** Ready-made Hebrew caption stickers (a text bubble in a soft card). */
export const CAPTION_STICKERS: { id: string; text: string; tone: "pink" | "cream" | "green" }[] = [
  { id: "sweet-year", text: "שנה טובה ומתוקה", tone: "cream" },
  { id: "with-love", text: "ממני באהבה", tone: "pink" },
  { id: "family", text: "המשפחה שלנו", tone: "green" },
  { id: "best-friends", text: "לחברה הכי טובה", tone: "pink" },
  { id: "mom-dad", text: "לאמא ואבא האהובים", tone: "cream" },
  { id: "sweet-only", text: "שיהיה רק מתוק", tone: "cream" },
  { id: "love-you", text: "אוהבים אותך", tone: "pink" },
  { id: "happy-birthday", text: "יום הולדת שמח", tone: "green" },
  { id: "welcome", text: "ברוך הבא לעולם", tone: "pink" },
  { id: "moments", text: "רגעים קטנים של אושר", tone: "cream" },
];

export type PlacedSticker = {
  uid: string;
  kind?: StickerKind;
  text?: string;
  tone?: "pink" | "cream" | "green";
  /** Position as a fraction of the card (0–1). */
  x: number;
  y: number;
  scale: number;
};
