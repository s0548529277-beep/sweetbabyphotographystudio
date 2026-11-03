/**
 * צבעי המשפכים — one palette per funnel, matched to the page it lives on.
 * Edit here to restyle the floating button, the in-page button and the dialog of a funnel.
 *
 *   entry        — home page: the site's forest green blended into the brand rose
 *   studio       — /studio-rental: forest green + sage
 *   photography  — /studio-photography: warm terracotta
 *   newborn      — /newborn: that page's own brown / sand / cream
 */
import type { FunnelId } from "@/lib/funnels";

export type FunnelTheme = {
  /** CSS gradient of the buttons and the dialog header (white text sits on it). */
  gradient: string;
  /** Solid colour for submit buttons and highlights. */
  solid: string;
  solidHover: string;
  /** Dialog background / card tint / border / main text. */
  soft: string;
  tint: string;
  border: string;
  ink: string;
  /** Light accent (small chips, the check marks). */
  accent: string;
  emoji: string;
  /** Short name shown in the dialog header. */
  title: string;
  /** The floating button. */
  floatLabel: string;
  floatSub: string;
};

export const FUNNEL_THEMES: Record<FunnelId, FunnelTheme> = {
  entry: {
    gradient: "linear-gradient(135deg,#2d3d2b 0%,#8a4a5c 100%)",
    solid: "#a8465f",
    solidHover: "#8f3a50",
    soft: "#fdf1ee",
    tint: "#f9dcd6",
    border: "#e8a99c",
    ink: "#2d3d2b",
    accent: "#e8a99c",
    emoji: "✨",
    title: "בואי נמצא מה מתאים לך",
    floatLabel: "לא בטוחה מה מתאים לך?",
    floatSub: "כמה שאלות ונמצא יחד",
  },
  studio: {
    gradient: "linear-gradient(135deg,#2d3d2b 0%,#5f8a58 100%)",
    solid: "#2d3d2b",
    solidHover: "#3d5239",
    soft: "#f1f5ec",
    tint: "#dfeadb",
    border: "#9dbb94",
    ink: "#2d3d2b",
    accent: "#e8a99c",
    emoji: "🎞️",
    title: "שכירת הסטודיו",
    floatLabel: "כמה יעלה לי הסטודיו?",
    floatSub: "חישוב מהיר + מתנה להרשמה 🎁",
  },
  photography: {
    gradient: "linear-gradient(135deg,#9c4a36 0%,#e08a62 100%)",
    solid: "#a8523b",
    solidHover: "#8e4430",
    soft: "#fdf0ea",
    tint: "#f8d9cb",
    border: "#e8a98a",
    ink: "#4a2a1f",
    accent: "#f5d5cf",
    emoji: "📸",
    title: "סשן צילום עם מיכל",
    floatLabel: "איזה סשן מתאים לי?",
    floatSub: "4 שאלות והמלצה אישית",
  },
  newborn: {
    gradient: "linear-gradient(135deg,#4a3221 0%,#a47a45 100%)",
    solid: "#4a3221",
    solidHover: "#3a2618",
    soft: "#fdf3ec",
    tint: "#f3e3d0",
    border: "#d9b98a",
    ink: "#4a3221",
    accent: "#d9b98a",
    emoji: "👶",
    title: "צילומי ניו-בורן",
    floatLabel: "איזו חבילה מתאימה לי?",
    floatSub: "3 שאלות והמלצה אישית",
  },
};
