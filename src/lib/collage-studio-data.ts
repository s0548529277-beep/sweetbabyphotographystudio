/**
 * Data schema + template library for the professional Collage Studio
 * (/collage-studio) — the real, Canva-style editor. Deliberately separate
 * from src/lib/collage-data.ts, which powers the older, simpler free
 * public /collage-maker tool; the two are independent products sharing
 * only the general idea of "arrange photos + text + captions."
 *
 * Templates are plain data, not code — the whole point (per spec) is that
 * adding template #31 never touches StudioCanvas/StudioEditor. Every
 * coordinate is in the template's own canvas pixel space (see `canvas`).
 */

export type StudioImageShape = "rect" | "rounded" | "circle" | "heart" | "arch";

export type StudioImageElement = {
  type: "image";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shape?: StudioImageShape;
};

export type StudioTextElement = {
  type: "text";
  id: string;
  text: string;
  x: number;
  y: number;
  width?: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  align?: "right" | "center" | "left";
  bold?: boolean;
  rotation?: number;
};

export type StudioShapeElement = {
  type: "shape";
  id: string;
  /** References one entry in ELEMENT_LIBRARY (collage-studio-library.ts). */
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color?: string;
  opacity?: number;
};

export type StudioElement = StudioImageElement | StudioTextElement | StudioShapeElement;

export type CollageTemplateCategoryId =
  | "newborn"
  | "kids"
  | "family"
  | "chalaka"
  | "birthday1"
  | "batmitzvah"
  | "birthdays"
  | "albums"
  | "greetings"
  | "seasons"
  | "holidays"
  | "modern"
  | "minimal"
  | "luxury"
  | "classic";

export const TEMPLATE_CATEGORIES: { id: CollageTemplateCategoryId; label: string }[] = [
  { id: "newborn", label: "ניו בורן" },
  { id: "kids", label: "ילדים" },
  { id: "family", label: "משפחה" },
  { id: "chalaka", label: "חלאקה" },
  { id: "birthday1", label: "גיל שנה" },
  { id: "batmitzvah", label: "בת מצווה" },
  { id: "birthdays", label: "ימי הולדת" },
  { id: "albums", label: "אלבומים" },
  { id: "greetings", label: "ברכות" },
  { id: "seasons", label: "עונות" },
  { id: "holidays", label: "חגים" },
  { id: "modern", label: "מודרני" },
  { id: "minimal", label: "מינימליסטי" },
  { id: "luxury", label: "יוקרתי" },
  { id: "classic", label: "קלאסי" },
];

export type CollageTemplate = {
  id: string;
  name: string;
  category: CollageTemplateCategoryId;
  style: "modern" | "minimal" | "luxury" | "classic" | "kids";
  photoCount: number;
  canvas: { width: number; height: number };
  background: { color: string };
  elements: StudioElement[];
};

export function findTemplate(id: string): CollageTemplate | undefined {
  return COLLAGE_TEMPLATES.find((t) => t.id === id);
}

export function countImageElements(t: CollageTemplate): number {
  return t.elements.filter((e) => e.type === "image").length;
}

// ---------------------------------------------------------------------
// Templates. 12 real, hand-composed starting templates across most of the
// requested categories — the engine underneath supports an unlimited
// number with zero code changes; growing the library from here on is
// content work, not engineering.
// ---------------------------------------------------------------------

const heart = "#c9738f";
const gold = "#b6912a";
const sage = "#6b8a63";
const navy = "#1d3a54";

export const COLLAGE_TEMPLATES: CollageTemplate[] = [
  {
    id: "good-year",
    name: "שנה טובה",
    category: "holidays",
    style: "classic",
    photoCount: 2,
    canvas: { width: 1000, height: 1300 },
    background: { color: "#fdf8f0" },
    elements: [
      { type: "shape", id: "e1", elementId: "honey-jar", x: 40, y: 40, width: 80, height: 80, color: gold, rotation: -8 },
      { type: "shape", id: "e2", elementId: "apple", x: 885, y: 40, width: 75, height: 75, color: "#a4402f", rotation: 8 },
      { type: "image", id: "p1", x: 80, y: 80, width: 840, height: 520, shape: "rounded" },
      { type: "image", id: "p2", x: 80, y: 630, width: 840, height: 380, shape: "rounded" },
      { type: "shape", id: "s1", elementId: "line-1", x: 80, y: 1035, width: 840, height: 4, color: gold },
      { type: "shape", id: "e3", elementId: "sparkle", x: 40, y: 1090, width: 44, height: 44, color: gold, opacity: 0.85 },
      { type: "shape", id: "e4", elementId: "sparkle", x: 916, y: 1090, width: 44, height: 44, color: gold, opacity: 0.85 },
      { type: "text", id: "t1", text: "שנה טובה", x: 500, y: 1120, fontSize: 76, fontFamily: "'Frank Ruhl Libre', serif", color: "#5a3d1c", align: "center", bold: true },
      { type: "shape", id: "e5", elementId: "bee", x: 110, y: 1192, width: 42, height: 42, color: "#5a3d1c", opacity: 0.85 },
      { type: "text", id: "t2", text: "שנה של שקט, שמחה והרבה נחת", x: 500, y: 1215, fontSize: 30, fontFamily: "Assistant, sans-serif", color: "#5a3d1c", align: "center" },
      { type: "shape", id: "e5b", elementId: "bee", x: 848, y: 1192, width: 42, height: 42, color: "#5a3d1c", opacity: 0.85 },
      { type: "shape", id: "e6", elementId: "heart-small-pair", x: 40, y: 1180, width: 55, height: 55, color: gold, opacity: 0.6 },
      { type: "shape", id: "e7", elementId: "heart-small-pair", x: 900, y: 1180, width: 55, height: 55, color: gold, opacity: 0.6 },
    ],
  },
  {
    id: "our-moments",
    name: "הרגעים שלנו",
    category: "family",
    style: "modern",
    photoCount: 4,
    canvas: { width: 1100, height: 1400 },
    background: { color: "#ffffff" },
    elements: [
      { type: "image", id: "p1", x: 60, y: 60, width: 980, height: 560, shape: "rect" },
      { type: "image", id: "p2", x: 60, y: 640, width: 470, height: 400, shape: "rect" },
      { type: "image", id: "p3", x: 570, y: 640, width: 470, height: 400, shape: "rect" },
      { type: "image", id: "p4", x: 60, y: 1060, width: 980, height: 200, shape: "rect" },
      { type: "shape", id: "e1", elementId: "line-divider", x: 350, y: 1240, width: 400, height: 16, color: "#1f1f1f", opacity: 0.55 },
      { type: "text", id: "t1", text: "הרגעים שלנו", x: 550, y: 1280, fontSize: 60, fontFamily: "Heebo, sans-serif", color: "#1f1f1f", align: "center", bold: true },
      { type: "text", id: "t2", text: "המשפחה שלנו", x: 550, y: 1360, fontSize: 26, fontFamily: "Heebo, sans-serif", color: "#1f1f1f", align: "center" },
    ],
  },
  {
    id: "first-year",
    name: "שנה ראשונה",
    category: "birthday1",
    style: "kids",
    photoCount: 6,
    canvas: { width: 1100, height: 1400 },
    background: { color: "#fdf3f0" },
    elements: [
      { type: "image", id: "p1", x: 60, y: 60, width: 700, height: 620, shape: "rounded" },
      { type: "image", id: "p2", x: 780, y: 60, width: 260, height: 300, shape: "circle" },
      { type: "image", id: "p3", x: 780, y: 380, width: 260, height: 300, shape: "circle" },
      { type: "image", id: "p4", x: 60, y: 700, width: 330, height: 330, shape: "rounded" },
      { type: "image", id: "p5", x: 410, y: 700, width: 330, height: 330, shape: "rounded" },
      { type: "image", id: "p6", x: 760, y: 700, width: 280, height: 330, shape: "rounded" },
      { type: "shape", id: "e1", elementId: "balloon", x: 900, y: 40, width: 60, height: 90, color: heart },
      { type: "shape", id: "e2", elementId: "confetti-mix", x: 30, y: 30, width: 70, height: 70, color: gold, opacity: 0.9 },
      { type: "shape", id: "e3", elementId: "star", x: 1000, y: 655, width: 55, height: 55, color: gold, rotation: 15 },
      { type: "shape", id: "e4", elementId: "sparkle", x: 370, y: 655, width: 40, height: 40, color: heart },
      { type: "shape", id: "e5", elementId: "heart-small-pair", x: 20, y: 1055, width: 65, height: 65, color: heart, opacity: 0.85 },
      { type: "shape", id: "e6", elementId: "confetti", x: 1010, y: 1055, width: 70, height: 70, color: gold, opacity: 0.85 },
      { type: "text", id: "t1", text: "השנה הראשונה שלנו", x: 550, y: 1130, fontSize: 58, fontFamily: "'Secular One', sans-serif", color: "#7a3540", align: "center" },
      { type: "text", id: "t2", text: "איזה כיף שגדלת", x: 550, y: 1210, fontSize: 28, fontFamily: "Assistant, sans-serif", color: "#7a3540", align: "center" },
    ],
  },
  {
    id: "from-the-heart",
    name: "ברכה מכל הלב",
    category: "greetings",
    style: "luxury",
    photoCount: 1,
    canvas: { width: 1000, height: 1300 },
    background: { color: "#1c1a17" },
    elements: [
      { type: "shape", id: "f1", elementId: "frame-corners", x: 30, y: 30, width: 940, height: 1240, color: "#e8cf9f", opacity: 0.4 },
      { type: "image", id: "p1", x: 100, y: 100, width: 800, height: 900, shape: "arch" },
      { type: "shape", id: "e1", elementId: "sparkle", x: 60, y: 55, width: 46, height: 46, color: "#e8cf9f" },
      { type: "shape", id: "e2", elementId: "sparkle", x: 894, y: 55, width: 46, height: 46, color: "#e8cf9f" },
      { type: "shape", id: "e3", elementId: "heart-outline", x: 150, y: 1058, width: 40, height: 40, color: "#e8cf9f", opacity: 0.75 },
      { type: "text", id: "t1", text: "מכל הלב", x: 500, y: 1090, fontSize: 70, fontFamily: "'Frank Ruhl Libre', serif", color: "#e8cf9f", align: "center", bold: true },
      { type: "shape", id: "e3b", elementId: "heart-outline", x: 810, y: 1058, width: 40, height: 40, color: "#e8cf9f", opacity: 0.75 },
      { type: "text", id: "t2", text: "מתנה שנשארת לתמיד", x: 500, y: 1180, fontSize: 28, fontFamily: "Assistant, sans-serif", color: "#e8cf9f", align: "center" },
    ],
  },
  {
    id: "welcome-newborn",
    name: "ברוכים הבאים לעולם",
    category: "newborn",
    style: "minimal",
    photoCount: 3,
    canvas: { width: 1000, height: 1300 },
    background: { color: "#ffffff" },
    elements: [
      { type: "image", id: "p1", x: 60, y: 60, width: 880, height: 620, shape: "rounded" },
      { type: "image", id: "p2", x: 60, y: 700, width: 425, height: 330, shape: "rounded" },
      { type: "image", id: "p3", x: 505, y: 700, width: 435, height: 330, shape: "rounded" },
      { type: "shape", id: "e1", elementId: "cloud", x: 30, y: 40, width: 90, height: 55, color: "#cfe0ee", opacity: 0.8 },
      { type: "shape", id: "e2", elementId: "moon-stars", x: 880, y: 35, width: 70, height: 70, color: "#f3d9a4", opacity: 0.85 },
      { type: "text", id: "t1", text: "ברוכים הבאים לעולם", x: 500, y: 1120, fontSize: 54, fontFamily: "Heebo, sans-serif", color: "#2d2d2d", align: "center" },
      { type: "shape", id: "e3", elementId: "heart-outline", x: 150, y: 1095, width: 36, height: 36, color: "#e3aeb8", opacity: 0.8 },
      { type: "shape", id: "e3b", elementId: "heart-outline", x: 814, y: 1095, width: 36, height: 36, color: "#e3aeb8", opacity: 0.8 },
      { type: "text", id: "t2", text: "קטן כל כך, אהוב כל כך", x: 500, y: 1190, fontSize: 26, fontFamily: "Assistant, sans-serif", color: "#2d2d2d", align: "center" },
    ],
  },
  {
    id: "my-chalaka",
    name: "החלאקה שלי",
    category: "chalaka",
    style: "classic",
    photoCount: 5,
    canvas: { width: 1100, height: 1400 },
    background: { color: "#f3ede2" },
    elements: [
      { type: "image", id: "p1", x: 60, y: 60, width: 980, height: 500, shape: "rect" },
      { type: "image", id: "p2", x: 60, y: 580, width: 315, height: 330, shape: "rect" },
      { type: "image", id: "p3", x: 393, y: 580, width: 314, height: 330, shape: "rect" },
      { type: "image", id: "p4", x: 725, y: 580, width: 315, height: 330, shape: "rect" },
      { type: "image", id: "p5", x: 60, y: 930, width: 980, height: 220, shape: "rect" },
      { type: "shape", id: "e1", elementId: "flower-branch", x: 25, y: 25, width: 90, height: 90, color: gold, rotation: -15 },
      { type: "shape", id: "e2", elementId: "flower-branch", x: 985, y: 25, width: 90, height: 90, color: gold, rotation: 15 },
      { type: "shape", id: "e3", elementId: "bow", x: 505, y: 1155, width: 60, height: 60, color: gold },
      { type: "text", id: "t1", text: "החלאקה שלי", x: 550, y: 1230, fontSize: 62, fontFamily: "'David Libre', serif", color: "#5a4a30", align: "center", bold: true },
      { type: "shape", id: "e4", elementId: "leaf-pair", x: 25, y: 1290, width: 65, height: 65, color: sage, opacity: 0.8 },
      { type: "shape", id: "e5", elementId: "leaf-pair", x: 1010, y: 1290, width: 65, height: 65, color: sage, opacity: 0.8 },
      { type: "text", id: "t2", text: "היום המיוחד שלי", x: 550, y: 1310, fontSize: 28, fontFamily: "Assistant, sans-serif", color: "#5a4a30", align: "center" },
    ],
  },
  {
    id: "bat-mitzvah",
    name: "בת המצווה שלי",
    category: "batmitzvah",
    style: "luxury",
    photoCount: 4,
    canvas: { width: 1000, height: 1300 },
    background: { color: "#221f1b" },
    elements: [
      { type: "image", id: "p1", x: 80, y: 80, width: 840, height: 500, shape: "rounded" },
      { type: "image", id: "p2", x: 80, y: 610, width: 400, height: 340, shape: "rounded" },
      { type: "image", id: "p3", x: 520, y: 610, width: 400, height: 340, shape: "rounded" },
      { type: "image", id: "p4", x: 80, y: 980, width: 840, height: 130, shape: "rounded" },
      { type: "shape", id: "f1", elementId: "frame-thin", x: 40, y: 40, width: 920, height: 1220, color: gold, opacity: 0.3 },
      { type: "shape", id: "e1", elementId: "star-outline", x: 55, y: 55, width: 46, height: 46, color: gold },
      { type: "shape", id: "e2", elementId: "star-outline", x: 899, y: 55, width: 46, height: 46, color: gold },
      { type: "shape", id: "e3", elementId: "sparkle", x: 150, y: 1170, width: 38, height: 38, color: gold, opacity: 0.85 },
      { type: "shape", id: "e4", elementId: "sparkle", x: 812, y: 1170, width: 38, height: 38, color: gold, opacity: 0.85 },
      { type: "text", id: "t1", text: "בת מצווה שמחה", x: 500, y: 1180, fontSize: 56, fontFamily: "'Frank Ruhl Libre', serif", color: gold, align: "center" },
    ],
  },
  {
    id: "happy-birthday",
    name: "יום הולדת שמח",
    category: "birthdays",
    style: "kids",
    photoCount: 3,
    canvas: { width: 1400, height: 1080 },
    background: { color: "#fff4ea" },
    elements: [
      { type: "image", id: "p1", x: 60, y: 60, width: 620, height: 960, shape: "rounded" },
      { type: "image", id: "p2", x: 720, y: 60, width: 620, height: 460, shape: "rounded" },
      { type: "image", id: "p3", x: 720, y: 560, width: 620, height: 460, shape: "rounded" },
      { type: "shape", id: "e1", elementId: "balloon", x: 1310, y: 15, width: 60, height: 90, color: "#e0763f", rotation: 8 },
      { type: "shape", id: "e2", elementId: "confetti-mix", x: 30, y: 1000, width: 65, height: 65, color: "#e0763f", opacity: 0.9 },
      { type: "shape", id: "e3", elementId: "star", x: 660, y: 995, width: 42, height: 42, color: "#e0763f", rotation: 12 },
      { type: "shape", id: "e4", elementId: "sparkle", x: 1345, y: 530, width: 40, height: 40, color: "#e0763f" },
      { type: "text", id: "t1", text: "יום הולדת שמח", x: 1030, y: 1030, fontSize: 44, fontFamily: "'Secular One', sans-serif", color: "#e0763f", align: "center" },
    ],
  },
  {
    id: "our-album",
    name: "האלבום שלנו",
    category: "albums",
    style: "modern",
    photoCount: 6,
    canvas: { width: 1400, height: 1000 },
    background: { color: "#ffffff" },
    elements: [
      { type: "image", id: "p1", x: 40, y: 40, width: 620, height: 920, shape: "rect" },
      { type: "image", id: "p2", x: 680, y: 40, width: 340, height: 300, shape: "rect" },
      { type: "image", id: "p3", x: 1040, y: 40, width: 320, height: 300, shape: "rect" },
      { type: "image", id: "p4", x: 680, y: 360, width: 680, height: 300, shape: "rect" },
      { type: "image", id: "p5", x: 680, y: 680, width: 330, height: 280, shape: "rect" },
      { type: "image", id: "p6", x: 1030, y: 680, width: 330, height: 280, shape: "rect" },
      { type: "shape", id: "e1", elementId: "bow", x: 10, y: 10, width: 55, height: 55, color: heart, rotation: -10 },
      { type: "shape", id: "e2", elementId: "heart-small-pair", x: 1335, y: 925, width: 55, height: 55, color: heart, opacity: 0.75 },
    ],
  },
  {
    id: "our-smile",
    name: "החיוך שלנו",
    category: "kids",
    style: "minimal",
    photoCount: 2,
    canvas: { width: 1100, height: 1100 },
    background: { color: "#f7f5f0" },
    elements: [
      { type: "image", id: "p1", x: 60, y: 60, width: 500, height: 980, shape: "rounded" },
      { type: "image", id: "p2", x: 590, y: 60, width: 450, height: 480, shape: "rounded" },
      { type: "shape", id: "e1", elementId: "flower-daisy", x: 600, y: 570, width: 42, height: 42, color: heart, rotation: 10 },
      { type: "shape", id: "e2", elementId: "heart-small-pair", x: 985, y: 555, width: 50, height: 50, color: heart, opacity: 0.85 },
      { type: "text", id: "t1", text: "החיוך שלנו", x: 815, y: 620, fontSize: 46, fontFamily: "Rubik, sans-serif", color: "#2d2d2d", align: "center" },
      { type: "text", id: "t2", text: "הרגעים הקטנים", x: 815, y: 680, fontSize: 24, fontFamily: "Assistant, sans-serif", color: "#2d2d2d", align: "center", },
      { type: "shape", id: "e3", elementId: "sparkle", x: 660, y: 985, width: 34, height: 34, color: heart, opacity: 0.8 },
    ],
  },
  {
    id: "our-family",
    name: "המשפחה שלנו",
    category: "family",
    style: "classic",
    photoCount: 1,
    canvas: { width: 1000, height: 1300 },
    background: { color: "#ffffff" },
    elements: [
      { type: "image", id: "p1", x: 70, y: 70, width: 860, height: 980, shape: "rect" },
      { type: "shape", id: "b1", elementId: "frame-thin", x: 40, y: 40, width: 920, height: 1040, color: "#2d2d2d" },
      { type: "shape", id: "e1", elementId: "leaf-branch", x: 30, y: 1110, width: 65, height: 65, color: sage, opacity: 0.6, rotation: -15 },
      { type: "shape", id: "e2", elementId: "leaf-branch", x: 905, y: 1110, width: 65, height: 65, color: sage, opacity: 0.6, rotation: 15 },
      { type: "text", id: "t1", text: "המשפחה שלנו", x: 500, y: 1150, fontSize: 54, fontFamily: "'David Libre', serif", color: "#2d2d2d", align: "center" },
      { type: "text", id: "t2", text: "יחד זה הבית", x: 500, y: 1225, fontSize: 26, fontFamily: "Assistant, sans-serif", color: "#2d2d2d", align: "center" },
    ],
  },
  {
    id: "spring-season",
    name: "עונת האביב",
    category: "seasons",
    style: "modern",
    photoCount: 4,
    canvas: { width: 1000, height: 1300 },
    background: { color: "#f3f6f1" },
    elements: [
      { type: "image", id: "p1", x: 60, y: 60, width: 420, height: 520, shape: "rounded" },
      { type: "image", id: "p2", x: 510, y: 60, width: 430, height: 520, shape: "rounded" },
      { type: "image", id: "p3", x: 60, y: 610, width: 430, height: 420, shape: "rounded" },
      { type: "image", id: "p4", x: 520, y: 610, width: 420, height: 420, shape: "rounded" },
      { type: "shape", id: "e1", elementId: "flower", x: 20, y: 20, width: 70, height: 70, color: sage, rotation: -10 },
      { type: "shape", id: "e2", elementId: "flower-branch", x: 875, y: 15, width: 90, height: 90, color: sage, rotation: 15 },
      { type: "shape", id: "leaf1", elementId: "leaf", x: 40, y: 1040, width: 90, height: 60, color: sage },
      { type: "shape", id: "e3", elementId: "leaf-pair", x: 895, y: 1075, width: 65, height: 65, color: sage, opacity: 0.8 },
      { type: "text", id: "t1", text: "רגעים שנשארים", x: 500, y: 1160, fontSize: 50, fontFamily: "Heebo, sans-serif", color: "#3c4a36", align: "center" },
    ],
  },
];
