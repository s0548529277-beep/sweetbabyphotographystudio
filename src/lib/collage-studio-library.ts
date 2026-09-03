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

// English mirror of STUDIO_TEXT_PRESETS above — same groups, same order,
// direct translations (not a live translator — this codebase has no
// translation API access, see CAPTION_TRANSLATIONS in collage-data.ts for
// the identical reasoning on the free tool). Kept as a fully separate array
// rather than a lookup keyed off the Hebrew text so a caption here can be
// tuned to read naturally in English instead of a literal word-for-word
// match.
export const STUDIO_TEXT_PRESETS_EN: { group: string; items: { text: string; subtitle?: string }[] }[] = [
  {
    group: "Holidays & Blessings",
    items: [
      { text: "Happy New Year", subtitle: "A year of peace, joy and true nachas" },
      { text: "With All Our Heart", subtitle: "A gift that lasts forever" },
      { text: "Mazal Tov" },
      { text: "Welcome to the World" },
    ],
  },
  {
    group: "Newborn",
    items: [
      { text: "Welcome to the World" },
      { text: "The First Moments" },
      { text: "So Tiny, So Loved" },
    ],
  },
  {
    group: "Kids",
    items: [
      { text: "The Little Moments" },
      { text: "Our Smile" },
    ],
  },
  {
    group: "Family",
    items: [
      { text: "Our Family" },
      { text: "Together Is Home" },
    ],
  },
  {
    group: "Chalaka",
    items: [
      { text: "My Special Day" },
      { text: "A New Beginning" },
    ],
  },
  {
    group: "Milestones",
    items: [
      { text: "Our First Year" },
      { text: "Look How You've Grown" },
      { text: "Our Moments", subtitle: "The little moments that become big memories" },
      { text: "Our Story" },
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
// Fonts — real Hebrew- and English-supporting Google Fonts (loaded via the
// collage-studio route's own head links, not site-wide), covering all four
// requested combinations: serif/sans-serif × print/script(handwriting), in
// both Hebrew and English. `category` and `lang` are only used to GROUP
// this same flat list in the font picker (StudioEditor.tsx) — every font
// still works as a plain family string wherever one's already used.
// True Hebrew script/handwriting webfonts are rare; Gveret Levin (cursive
// "school exercise book" Hebrew) and Solitreo (a revival of the Sephardic
// cursive Hebrew hand) are the two real ones on Google Fonts — confirmed
// via Google's own Hebrew-subset font listing, not guessed. Montserrat/
// Playfair/Cormorant from the original ask don't ship Hebrew glyphs, so
// Hebrew keeps its own equivalents (Frank Ruhl Libre for an elegant serif,
// Secular One for a bold display face) — those same Latin-oriented families
// are used for the English rows instead, where they belong.
// ---------------------------------------------------------------------
export type StudioFontCategory = "serif" | "sans" | "script";
export type StudioFontLang = "he" | "en";

export const STUDIO_FONT_CATEGORY_LABELS: Record<StudioFontCategory, string> = {
  serif: "סריף",
  sans: "סאנס-סריף",
  script: "כתב יד",
};
export const STUDIO_FONT_LANG_LABELS: Record<StudioFontLang, string> = { he: "עברית", en: "אנגלית" };

export const STUDIO_FONTS: { id: string; label: string; family: string; category: StudioFontCategory; lang: StudioFontLang }[] = [
  // Hebrew — sans-serif
  { id: "assistant", label: "אסיסטנט", family: "Assistant, sans-serif", category: "sans", lang: "he" },
  { id: "heebo", label: "היבו", family: "Heebo, sans-serif", category: "sans", lang: "he" },
  { id: "rubik", label: "רוביק", family: "Rubik, sans-serif", category: "sans", lang: "he" },
  { id: "alef", label: "אלף", family: "Alef, sans-serif", category: "sans", lang: "he" },
  { id: "secular-one", label: "סקולר וואן", family: "'Secular One', sans-serif", category: "sans", lang: "he" },
  // Hebrew — serif
  { id: "david-libre", label: "דיוויד ליברה", family: "'David Libre', serif", category: "serif", lang: "he" },
  { id: "frank-ruhl", label: "פרנק רוהל ליברה", family: "'Frank Ruhl Libre', serif", category: "serif", lang: "he" },
  { id: "noto-serif-he", label: "נוטו סריף עברית", family: "'Noto Serif Hebrew', serif", category: "serif", lang: "he" },
  // Hebrew — script / handwriting
  { id: "gveret-levin", label: "גברת לוין (כתב יד)", family: "'Gveret Levin', cursive", category: "script", lang: "he" },
  { id: "solitreo", label: "סוליטריאו (כתב יד)", family: "Solitreo, cursive", category: "script", lang: "he" },
  // English — sans-serif
  { id: "poppins", label: "Poppins", family: "Poppins, sans-serif", category: "sans", lang: "en" },
  { id: "montserrat", label: "Montserrat", family: "Montserrat, sans-serif", category: "sans", lang: "en" },
  { id: "inter", label: "Inter", family: "Inter, sans-serif", category: "sans", lang: "en" },
  // English — serif
  { id: "playfair", label: "Playfair Display", family: "'Playfair Display', serif", category: "serif", lang: "en" },
  { id: "cormorant", label: "Cormorant Garamond", family: "'Cormorant Garamond', serif", category: "serif", lang: "en" },
  { id: "lora", label: "Lora", family: "Lora, serif", category: "serif", lang: "en" },
  { id: "dm-serif", label: "DM Serif Display", family: "'DM Serif Display', serif", category: "serif", lang: "en" },
  // English — script / handwriting
  { id: "dancing-script", label: "Dancing Script", family: "'Dancing Script', cursive", category: "script", lang: "en" },
  { id: "caveat", label: "Caveat", family: "Caveat, cursive", category: "script", lang: "en" },
  { id: "great-vibes", label: "Great Vibes", family: "'Great Vibes', cursive", category: "script", lang: "en" },
];

export const STUDIO_FONTS_GOOGLE_HREF =
  "https://fonts.googleapis.com/css2" +
  "?family=Heebo:wght@300;400;500;600;700" +
  "&family=Rubik:wght@400;500;600;700" +
  "&family=Alef:wght@400;700" +
  "&family=David+Libre:wght@400;500;700" +
  "&family=Frank+Ruhl+Libre:wght@400;500;700" +
  "&family=Secular+One" +
  "&family=Noto+Serif+Hebrew:wght@400;500;600;700" +
  "&family=Gveret+Levin" +
  "&family=Solitreo" +
  "&family=Poppins:wght@400;500;600;700" +
  "&family=Montserrat:wght@400;500;600;700" +
  "&family=Inter:wght@400;500;600;700" +
  "&family=Playfair+Display:wght@400;500;600;700" +
  "&family=Cormorant+Garamond:wght@400;500;600;700" +
  "&family=Lora:wght@400;500;600;700" +
  "&family=DM+Serif+Display" +
  "&family=Dancing+Script:wght@400;600;700" +
  "&family=Caveat:wght@400;600;700" +
  "&family=Great+Vibes" +
  "&display=swap";

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
  // Leaves
  { id: "leaf", category: "leaves", label: "עלה", svg: (c) => svgWrap(`<path d="M50,5 C80,25 90,60 50,95 C10,60 20,25 50,5 Z" fill="CURRENT"/><line x1="50" y1="10" x2="50" y2="90" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>`, c) },
  { id: "leaf-branch", category: "leaves", label: "ענף עלים", svg: (c) => svgWrap(`<line x1="10" y1="90" x2="90" y2="10" stroke="CURRENT" stroke-width="2"/>${[[25, 75], [45, 55], [65, 35]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="10" ry="6" fill="CURRENT" transform="rotate(-45 ${x} ${y})"/>`).join("")}`, c) },
  { id: "leaf-pair", category: "leaves", label: "שני עלים", svg: (c) => svgWrap(`<path d="M35,10 C55,25 60,55 35,90 C10,55 15,25 35,10 Z" fill="CURRENT" opacity="0.9"/><path d="M65,25 C82,38 86,60 65,88 C44,60 48,38 65,25 Z" fill="CURRENT" opacity="0.6"/>`, c) },
  // Flowers
  { id: "flower", category: "flowers", label: "פרח", svg: (c) => svgWrap(`${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="50" cy="28" rx="13" ry="22" fill="CURRENT" opacity="0.85" transform="rotate(${a} 50 50)"/>`).join("")}<circle cx="50" cy="50" r="9" fill="#f6d55c"/>`, c) },
  { id: "flower-daisy", category: "flowers", label: "חינניות", svg: (c) => svgWrap(`${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="50" cy="22" rx="8" ry="16" fill="CURRENT" opacity="0.9" transform="rotate(${a} 50 50)"/>`).join("")}<circle cx="50" cy="50" r="7" fill="#f6d55c"/>`, c) },
  { id: "flower-branch", category: "flowers", label: "ענף פרחים", svg: (c) => svgWrap(`<path d="M50,95 Q45,55 55,10" fill="none" stroke="CURRENT" stroke-width="2"/>${[[30, 70], [70, 45], [35, 25]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="CURRENT" opacity="0.85"/>`).join("")}`, c) },
  // Lines
  { id: "line-1", category: "lines", label: "קו", svg: (c) => svgWrap(`<line x1="2" y1="50" x2="98" y2="50" stroke="CURRENT" stroke-width="3"/>`, c) },
  { id: "line-wavy", category: "lines", label: "קו גלי", svg: (c) => svgWrap(`<path d="M0,50 Q25,20 50,50 T100,50" fill="none" stroke="CURRENT" stroke-width="3"/>`, c) },
  { id: "line-dashed", category: "lines", label: "קו מקווקו", svg: (c) => svgWrap(`<line x1="2" y1="50" x2="98" y2="50" stroke="CURRENT" stroke-width="3" stroke-dasharray="10 8"/>`, c) },
  { id: "line-divider", category: "lines", label: "מפריד עם נקודה", svg: (c) => svgWrap(`<line x1="2" y1="50" x2="42" y2="50" stroke="CURRENT" stroke-width="2"/><circle cx="50" cy="50" r="4" fill="CURRENT"/><line x1="58" y1="50" x2="98" y2="50" stroke="CURRENT" stroke-width="2"/>`, c) },
  // Frames
  { id: "frame-thin", category: "frames", label: "מסגרת דקה", svg: (c) => svgWrap(`<rect x="3" y="3" width="94" height="94" fill="none" stroke="CURRENT" stroke-width="2"/>`, c) },
  { id: "frame-double", category: "frames", label: "מסגרת כפולה", svg: (c) => svgWrap(`<rect x="2" y="2" width="96" height="96" fill="none" stroke="CURRENT" stroke-width="1.5"/><rect x="8" y="8" width="84" height="84" fill="none" stroke="CURRENT" stroke-width="1"/>`, c) },
  { id: "frame-corners", category: "frames", label: "פינות מסגרת", svg: (c) => svgWrap(`${[[3, 3, 1, 1], [97, 3, -1, 1], [3, 97, 1, -1], [97, 97, -1, -1]].map(([x, y, sx, sy]) => `<path d="M${x},${y + 20 * sy} L${x},${y} L${x + 20 * sx},${y}" fill="none" stroke="CURRENT" stroke-width="3"/>`).join("")}`, c) },
  { id: "frame-round", category: "frames", label: "מסגרת עגולה", svg: (c) => svgWrap(`<circle cx="50" cy="50" r="46" fill="none" stroke="CURRENT" stroke-width="2"/>`, c) },
  // Hearts
  { id: "heart-outline", category: "hearts", label: "לב מתאר", svg: (c) => svgWrap(`<path d="M50,88 C10,60 -8,28 22,14 C38,6 50,22 50,22 C50,22 62,6 78,14 C108,28 90,60 50,88 Z" fill="none" stroke="CURRENT" stroke-width="4"/>`, c) },
  { id: "heart-filled", category: "hearts", label: "לב מלא", svg: (c) => svgWrap(`<path d="M50,88 C10,60 -8,28 22,14 C38,6 50,22 50,22 C50,22 62,6 78,14 C108,28 90,60 50,88 Z" fill="CURRENT"/>`, c) },
  { id: "heart-small-pair", category: "hearts", label: "שני לבבות קטנים", svg: (c) => svgWrap(`<path d="M32,55 C15,42 5,28 20,20 C28,16 32,24 32,24 C32,24 36,16 44,20 C59,28 49,42 32,55 Z" fill="CURRENT"/><path d="M68,80 C51,67 41,53 56,45 C64,41 68,49 68,49 C68,49 72,41 80,45 C95,53 85,67 68,80 Z" fill="CURRENT" opacity="0.6"/>`, c) },
  // Stars
  { id: "star", category: "stars", label: "כוכב", svg: (c) => svgWrap(`<path d="M50,5 L61,38 L96,38 L68,58 L79,92 L50,71 L21,92 L32,58 L4,38 L39,38 Z" fill="CURRENT"/>`, c) },
  { id: "star-outline", category: "stars", label: "כוכב מתאר", svg: (c) => svgWrap(`<path d="M50,5 L61,38 L96,38 L68,58 L79,92 L50,71 L21,92 L32,58 L4,38 L39,38 Z" fill="none" stroke="CURRENT" stroke-width="3"/>`, c) },
  { id: "sparkle", category: "stars", label: "נצנוץ", svg: (c) => svgWrap(`<path d="M50,10 Q54,45 90,50 Q54,55 50,90 Q46,55 10,50 Q46,45 50,10 Z" fill="CURRENT"/>`, c) },
  // Confetti
  { id: "confetti", category: "confetti", label: "קונפטי", svg: (c) => svgWrap(Array.from({ length: 7 }, (_, i) => `<circle cx="${10 + i * 13}" cy="${20 + (i % 3) * 25}" r="${4 + (i % 2) * 2}" fill="CURRENT" opacity="0.8"/>`).join(""), c) },
  { id: "confetti-mix", category: "confetti", label: "קונפטי מעורב", svg: (c) => svgWrap(`<rect x="10" y="15" width="8" height="8" fill="CURRENT" transform="rotate(20 14 19)"/><circle cx="40" cy="70" r="5" fill="CURRENT"/><rect x="65" y="20" width="7" height="7" fill="CURRENT" transform="rotate(-15 68 23)"/><circle cx="80" cy="60" r="4" fill="CURRENT" opacity="0.7"/><rect x="30" y="45" width="6" height="6" fill="CURRENT" transform="rotate(35 33 48)"/>`, c) },
  // Illustrations
  { id: "balloon", category: "illustrations", label: "בלון", svg: (c) => svgWrap(`<ellipse cx="50" cy="35" rx="30" ry="35" fill="CURRENT"/><path d="M50,70 L44,80 L56,80 Z" fill="CURRENT"/><line x1="50" y1="80" x2="45" y2="98" stroke="CURRENT" stroke-width="2"/>`, c) },
  { id: "moon-stars", category: "illustrations", label: "ירח וכוכבים", svg: (c) => svgWrap(`<path d="M55,15 A25,25 0 1 0 55,65 A19,19 0 1 1 55,15 Z" fill="CURRENT"/><circle cx="82" cy="30" r="3" fill="CURRENT"/><circle cx="90" cy="50" r="4" fill="CURRENT"/>`, c) },
  { id: "cloud", category: "illustrations", label: "ענן", svg: (c) => svgWrap(`<ellipse cx="35" cy="55" rx="22" ry="16" fill="CURRENT"/><ellipse cx="60" cy="48" rx="26" ry="20" fill="CURRENT"/><ellipse cx="80" cy="58" rx="16" ry="12" fill="CURRENT"/>`, c) },
  { id: "rainbow", category: "illustrations", label: "קשת", svg: (c) => svgWrap(`<path d="M5,80 A45,45 0 0 1 95,80" fill="none" stroke="CURRENT" stroke-width="8"/><path d="M18,80 A32,32 0 0 1 82,80" fill="none" stroke="CURRENT" stroke-width="6" opacity="0.6"/>`, c) },
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
