/**
 * Shared library data for the Collage Studio editor — text presets, fonts,
 * color system, a small decorative-element library, and full-look design
 * presets. Pure data (plus the tiny SVG-path generators the element
 * library needs); StudioCanvas.tsx is the only place that turns any of
 * this into actual fabric.js objects.
 */

// ---------------------------------------------------------------------
// Text presets — ready-made captions, grouped by occasion (per the exact
// examples given), one click adds them to the canvas as a text element.
// ---------------------------------------------------------------------
export const STUDIO_TEXT_PRESETS: { group: string; items: { text: string; subtitle?: string }[] }[] = [
  {
    group: "חגים וברכות",
    items: [
      { text: "שנה טובה", subtitle: "שנה של שקט, שמחה והרבה נחת" },
      { text: "מכל הלב", subtitle: "מתנה שנשארת לתמיד" },
      { text: "מזל טוב" },
      { text: "ברוכים הבאים לעולם" },
    ],
  },
  {
    group: "ניו-בורן",
    items: [
      { text: "ברוך הבא לעולם" },
      { text: "הרגעים הראשונים" },
      { text: "קטן כל כך, אהוב כל כך" },
    ],
  },
  {
    group: "ילדים",
    items: [
      { text: "הרגעים הקטנים" },
      { text: "החיוך שלנו" },
    ],
  },
  {
    group: "משפחה",
    items: [
      { text: "המשפחה שלנו" },
      { text: "יחד זה הבית" },
    ],
  },
  {
    group: "חלאקה",
    items: [
      { text: "היום המיוחד שלי" },
      { text: "רגע של התחלה חדשה" },
    ],
  },
  {
    group: "אבני דרך",
    items: [
      { text: "השנה הראשונה שלנו" },
      { text: "איזה כיף שגדלת" },
      { text: "הרגעים שלנו", subtitle: "הרגעים הקטנים שהופכים לזיכרונות גדולים" },
      { text: "הסיפור שלנו" },
    ],
  },
];

// ---------------------------------------------------------------------
// Text style presets — a font/size pairing, not just a raw font choice;
// applying one sets both the selected text element's look in one click.
// ---------------------------------------------------------------------
export type TextStylePreset = {
  id: string;
  label: string;
  titleFont: string;
  titleSize: number;
  bodyFont: string;
  bodySize: number;
  bold?: boolean;
};

export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  { id: "elegant", label: "כותרת אלגנטית", titleFont: "'Frank Ruhl Libre', serif", titleSize: 72, bodyFont: "Assistant, sans-serif", bodySize: 28, bold: true },
  { id: "classic", label: "כותרת קלאסית", titleFont: "'David Libre', serif", titleSize: 62, bodyFont: "Assistant, sans-serif", bodySize: 26 },
  { id: "minimal", label: "מינימלי", titleFont: "Heebo, sans-serif", titleSize: 50, bodyFont: "Heebo, sans-serif", bodySize: 22 },
  { id: "luxury", label: "כותרת יוקרתית", titleFont: "'Frank Ruhl Libre', serif", titleSize: 64, bodyFont: "Assistant, sans-serif", bodySize: 24, bold: true },
  { id: "kids", label: "טקסט לילדים", titleFont: "'Secular One', sans-serif", titleSize: 56, bodyFont: "Rubik, sans-serif", bodySize: 26 },
  { id: "modern", label: "מודרני", titleFont: "Rubik, sans-serif", titleSize: 58, bodyFont: "Assistant, sans-serif", bodySize: 24, bold: true },
];

// ---------------------------------------------------------------------
// Fonts — real Hebrew-supporting Google Fonts (loaded via the
// collage-studio route's own head links, not site-wide). Montserrat/
// Playfair/Cormorant from the original ask don't ship Hebrew glyphs, so
// they're swapped for real Hebrew equivalents in the same spirit
// (Frank Ruhl Libre for an elegant serif, Secular One for a bold display
// face) — full RTL support was the explicit priority.
// ---------------------------------------------------------------------
export const STUDIO_FONTS: { id: string; label: string; family: string }[] = [
  { id: "assistant", label: "אסיסטנט", family: "Assistant, sans-serif" },
  { id: "heebo", label: "היבו", family: "Heebo, sans-serif" },
  { id: "rubik", label: "רוביק", family: "Rubik, sans-serif" },
  { id: "alef", label: "אלף", family: "Alef, sans-serif" },
  { id: "david-libre", label: "דיוויד ליברה", family: "'David Libre', serif" },
  { id: "frank-ruhl", label: "פרנק רוהל ליברה", family: "'Frank Ruhl Libre', serif" },
  { id: "secular-one", label: "סקולר וואן", family: "'Secular One', sans-serif" },
  { id: "dm-serif", label: "DM Serif Display", family: "'DM Serif Display', serif" },
];

export const STUDIO_FONTS_GOOGLE_HREF =
  "https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&family=Rubik:wght@400;500;600;700&family=Alef:wght@400;700&family=David+Libre:wght@400;500;700&family=Frank+Ruhl+Libre:wght@400;500;700&family=Secular+One&display=swap";

// ---------------------------------------------------------------------
// Color palettes — same idea as the free tool's, kept separate so the
// studio can grow its own set (Studio-specific: cream/beige/earth/olive/
// gold/mono/dusty/soft/kids/luxury, per the exact list requested).
// ---------------------------------------------------------------------
export type StudioPalette = { id: string; label: string; bg: string; accent: string; text: string };

export const STUDIO_PALETTES: StudioPalette[] = [
  { id: "cream", label: "קרם", bg: "#fdf8f0", accent: "#d9b98a", text: "#5a4a30" },
  { id: "beige", label: "בז'", bg: "#f3ede2", accent: "#b6a07a", text: "#4a3c28" },
  { id: "earth", label: "אדמה", bg: "#fbf1e9", accent: "#c1652f", text: "#5a2c14" },
  { id: "olive", label: "זית", bg: "#f3f6f1", accent: "#6b8a63", text: "#3c4a36" },
  { id: "gold", label: "זהב", bg: "#221f1b", accent: "#d4af6a", text: "#f3e6cf" },
  { id: "mono", label: "שחור ולבן", bg: "#ffffff", accent: "#1a1a1a", text: "#1a1a1a" },
  { id: "dusty", label: "מאובק", bg: "#f9f0f0", accent: "#b57677", text: "#5c2e2f" },
  { id: "soft", label: "רך", bg: "#fdf1f0", accent: "#d98a92", text: "#7a3540" },
  { id: "kids", label: "ילדים", bg: "#fff4ea", accent: "#e0763f", text: "#7a3110" },
  { id: "luxury", label: "יוקרה", bg: "#1c1a17", accent: "#d4af6a", text: "#f3e6cf" },
];

// ---------------------------------------------------------------------
// Element library — a small real set of decorative SVG elements, grouped
// exactly as requested. Each returns a self-contained SVG `d`/markup
// generator sized in a 0..1 unit box, scaled to the placed element's own
// width/height by StudioCanvas (loaded into fabric as an SVG data URI).
// ---------------------------------------------------------------------
export type ElementCategoryId = "flowers" | "leaves" | "lines" | "frames" | "hearts" | "stars" | "illustrations" | "confetti";

export const ELEMENT_CATEGORIES: { id: ElementCategoryId; label: string }[] = [
  { id: "flowers", label: "פרחים" },
  { id: "leaves", label: "עלים" },
  { id: "lines", label: "קווים" },
  { id: "frames", label: "מסגרות" },
  { id: "hearts", label: "לבבות" },
  { id: "stars", label: "כוכבים" },
  { id: "illustrations", label: "איורים" },
  { id: "confetti", label: "קונפטי" },
];

export type LibraryElement = { id: string; category: ElementCategoryId; label: string; svg: (color: string) => string };

const svgWrap = (inner: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner.replace(/CURRENT/g, color)}</svg>`;

export const ELEMENT_LIBRARY: LibraryElement[] = [
  { id: "leaf", category: "leaves", label: "עלה", svg: (c) => svgWrap(`<path d="M50,5 C80,25 90,60 50,95 C10,60 20,25 50,5 Z" fill="CURRENT"/><line x1="50" y1="10" x2="50" y2="90" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>`, c) },
  { id: "flower", category: "flowers", label: "פרח", svg: (c) => svgWrap(`${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="50" cy="28" rx="13" ry="22" fill="CURRENT" opacity="0.85" transform="rotate(${a} 50 50)"/>`).join("")}<circle cx="50" cy="50" r="9" fill="#f6d55c"/>`, c) },
  { id: "line-1", category: "lines", label: "קו", svg: (c) => svgWrap(`<line x1="2" y1="50" x2="98" y2="50" stroke="CURRENT" stroke-width="3"/>`, c) },
  { id: "line-wavy", category: "lines", label: "קו גלי", svg: (c) => svgWrap(`<path d="M0,50 Q25,20 50,50 T100,50" fill="none" stroke="CURRENT" stroke-width="3"/>`, c) },
  { id: "frame-thin", category: "frames", label: "מסגרת דקה", svg: (c) => svgWrap(`<rect x="3" y="3" width="94" height="94" fill="none" stroke="CURRENT" stroke-width="2"/>`, c) },
  { id: "frame-double", category: "frames", label: "מסגרת כפולה", svg: (c) => svgWrap(`<rect x="2" y="2" width="96" height="96" fill="none" stroke="CURRENT" stroke-width="1.5"/><rect x="8" y="8" width="84" height="84" fill="none" stroke="CURRENT" stroke-width="1"/>`, c) },
  { id: "heart-outline", category: "hearts", label: "לב מתאר", svg: (c) => svgWrap(`<path d="M50,88 C10,60 -8,28 22,14 C38,6 50,22 50,22 C50,22 62,6 78,14 C108,28 90,60 50,88 Z" fill="none" stroke="CURRENT" stroke-width="4"/>`, c) },
  { id: "heart-filled", category: "hearts", label: "לב מלא", svg: (c) => svgWrap(`<path d="M50,88 C10,60 -8,28 22,14 C38,6 50,22 50,22 C50,22 62,6 78,14 C108,28 90,60 50,88 Z" fill="CURRENT"/>`, c) },
  { id: "star", category: "stars", label: "כוכב", svg: (c) => svgWrap(`<path d="M50,5 L61,38 L96,38 L68,58 L79,92 L50,71 L21,92 L32,58 L4,38 L39,38 Z" fill="CURRENT"/>`, c) },
  { id: "confetti", category: "confetti", label: "קונפטי", svg: (c) => svgWrap(Array.from({ length: 7 }, (_, i) => `<circle cx="${10 + i * 13}" cy="${20 + (i % 3) * 25}" r="${4 + (i % 2) * 2}" fill="CURRENT" opacity="0.8"/>`).join(""), c) },
  { id: "balloon", category: "illustrations", label: "בלון", svg: (c) => svgWrap(`<ellipse cx="50" cy="35" rx="30" ry="35" fill="CURRENT"/><path d="M50,70 L44,80 L56,80 Z" fill="CURRENT"/><line x1="50" y1="80" x2="45" y2="98" stroke="CURRENT" stroke-width="2"/>`, c) },
  { id: "moon-stars", category: "illustrations", label: "ירח וכוכבים", svg: (c) => svgWrap(`<path d="M55,15 A25,25 0 1 0 55,65 A19,19 0 1 1 55,15 Z" fill="CURRENT"/><circle cx="82" cy="30" r="3" fill="CURRENT"/><circle cx="90" cy="50" r="4" fill="CURRENT"/>`, c) },
];

export function findElement(id: string): LibraryElement | undefined {
  return ELEMENT_LIBRARY.find((e) => e.id === id);
}

// ---------------------------------------------------------------------
// Design presets — a full look (bg + accent + text color + font pairing +
// a couple of matching decorative elements) applied to the whole canvas
// in one click, per the exact examples requested.
// ---------------------------------------------------------------------
export type DesignPreset = {
  id: string;
  label: string;
  description: string;
  palette: StudioPalette;
  textStyle: TextStylePreset;
  elementIds: string[];
};

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "soft-baby",
    label: "תינוק רך",
    description: "רקע שמנת, מסגרת עדינה, פונט רך, אלמנטים של עלים",
    palette: STUDIO_PALETTES.find((p) => p.id === "cream")!,
    textStyle: TEXT_STYLE_PRESETS.find((t) => t.id === "minimal")!,
    elementIds: ["leaf", "frame-thin"],
  },
  {
    id: "luxury-gold",
    label: "זהב יוקרתי",
    description: "רקע כהה, מסגרת זהב, פונט אלגנטי, אלמנטים מינימליסטיים",
    palette: STUDIO_PALETTES.find((p) => p.id === "gold")!,
    textStyle: TEXT_STYLE_PRESETS.find((t) => t.id === "luxury")!,
    elementIds: ["frame-double"],
  },
  {
    id: "natural",
    label: "טבעי",
    description: "גווני בז', ירוק עדין, עלים, טקסט טבעי",
    palette: STUDIO_PALETTES.find((p) => p.id === "olive")!,
    textStyle: TEXT_STYLE_PRESETS.find((t) => t.id === "classic")!,
    elementIds: ["leaf", "flower"],
  },
  {
    id: "classic-white",
    label: "קלאסי",
    description: "רקע לבן, מסגרת, טיפוגרפיה קלאסית",
    palette: STUDIO_PALETTES.find((p) => p.id === "mono")!,
    textStyle: TEXT_STYLE_PRESETS.find((t) => t.id === "classic")!,
    elementIds: ["frame-thin"],
  },
  {
    id: "playful-kids",
    label: "ילדים משחקי",
    description: "צבעים חמים, פונט משחקי, קונפטי ובלונים",
    palette: STUDIO_PALETTES.find((p) => p.id === "kids")!,
    textStyle: TEXT_STYLE_PRESETS.find((t) => t.id === "kids")!,
    elementIds: ["balloon", "confetti"],
  },
  {
    id: "dusty-romance",
    label: "רומנטי מאובק",
    description: "ורוד מאובק, לבבות עדינים, פונט אלגנטי",
    palette: STUDIO_PALETTES.find((p) => p.id === "dusty")!,
    textStyle: TEXT_STYLE_PRESETS.find((t) => t.id === "elegant")!,
    elementIds: ["heart-outline"],
  },
];
