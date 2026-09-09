import type {
  CollageStyleId,
  DecorThemeId,
  PhotoEffectId,
  PhotoShapeId,
} from "@/lib/collage-data";

export type CollageIdeaCategory =
  | "popular"
  | "newborn"
  | "first-year"
  | "family"
  | "chalaka"
  | "celebrations"
  | "holidays"
  | "editorial";

export type CollageIdea = {
  id: string;
  name: string;
  category: CollageIdeaCategory;
  description: string;
  photoCount: number;
  layoutId: string;
  styleId: CollageStyleId;
  shape: PhotoShapeId;
  effect: PhotoEffectId;
  borderStyle: "none" | "polaroid";
  decorId: DecorThemeId;
  caption: string;
  subtitle: string;
  motif: "grid" | "hero" | "strip" | "scatter" | "circle" | "story";
};

export const COLLAGE_IDEA_CATEGORIES: { id: CollageIdeaCategory; label: string }[] = [
  { id: "popular", label: "הכי אהובים" },
  { id: "newborn", label: "ניו בורן" },
  { id: "first-year", label: "שנה ראשונה" },
  { id: "family", label: "משפחה" },
  { id: "chalaka", label: "חלאקה" },
  { id: "celebrations", label: "חגיגות" },
  { id: "holidays", label: "חגים" },
  { id: "editorial", label: "מודרני" },
];

const idea = (
  id: string,
  name: string,
  category: CollageIdeaCategory,
  description: string,
  photoCount: number,
  layoutId: string,
  motif: CollageIdea["motif"],
  overrides: Partial<CollageIdea> = {},
): CollageIdea => ({
  id,
  name,
  category,
  description,
  photoCount,
  layoutId,
  motif,
  styleId: "floral",
  shape: "rounded",
  effect: "none",
  borderStyle: "none",
  decorId: "none",
  caption: name,
  subtitle: "רגעים שנשארים לתמיד",
  ...overrides,
});

/** Original, reusable starting points inspired by broad print and scrapbook
 * trends. They are configuration presets for our own renderer, not copied
 * artwork or downloaded third-party templates. */
export const COLLAGE_IDEAS: CollageIdea[] = [
  idea("soft-polaroids", "פולארויד ורוד", "popular", "ערימת תמונות רכה ושובבה", 6, "scatter", "scatter", { borderStyle: "polaroid" }),
  idea("hero-story", "סיפור בתמונה", "popular", "תמונה מרכזית ורגעים קטנים מסביבה", 5, "featured", "hero"),
  idea("film-strip", "סרט צילום", "popular", "רצף קולנועי נקי", 5, "strip", "strip", { styleId: "minimal", shape: "rect" }),
  idea("modern-mosaic", "מוזאיקה מודרנית", "popular", "קומפוזיציה לא סימטרית ומדויקת", 9, "mosaic", "grid", { styleId: "minimal", shape: "rect" }),
  idea("gallery-wall", "קיר גלריה", "popular", "מראה של הדפסי אמנות על הקיר", 8, "grid", "grid", { borderStyle: "polaroid", styleId: "minimal" }),

  idea("newborn-welcome", "ברוכים הבאים לעולם", "newborn", "דיוקן גדול ושני פרטים קטנים", 3, "featured", "hero", { decorId: "newborn", caption: "ברוכים הבאים לעולם", subtitle: "קטן כל כך, אהוב כל כך" }),
  idea("newborn-details", "פרטים קטנים", "newborn", "ידיים, רגליים, חיוך ודיוקן", 5, "mosaic", "grid", { decorId: "newborn", caption: "אהבה בפרטים הקטנים" }),
  idea("birth-stats", "תעודת לידה", "newborn", "תמונה אחת עם שם ופרטי לידה", 1, "featured", "story", { styleId: "minimal", shape: "arch", decorId: "newborn", caption: "נולדתי", subtitle: "שם · תאריך · שעה · משקל" }),
  idea("sleepy-triptych", "חלומות מתוקים", "newborn", "שלושה רגעים שקטים ברצף", 3, "strip", "strip", { effect: "soft", decorId: "newborn", caption: "חלומות מתוקים" }),

  idea("twelve-months", "12 חודשים", "first-year", "כל חודש בתמונה ועוד תמונת שנה", 13, "grid", "circle", { caption: "השנה הראשונה שלי", subtitle: "12 חודשים של אהבה", decorId: "birthday1" }),
  idea("number-one", "המספר אחת", "first-year", "רגעי השנה סביב תמונת יום ההולדת", 10, "featured", "hero", { caption: "אני בן שנה", decorId: "birthday1" }),
  idea("monthly-grid", "יומן חודשי", "first-year", "רשת מסודרת של רגעי הגדילה", 12, "grid", "grid", { styleId: "minimal", caption: "כמה גדלתי" }),
  idea("cake-smash", "קייק סמאש", "first-year", "צבעוני, שמח ומלא תנועה", 7, "scatter", "scatter", { decorId: "birthday1", borderStyle: "polaroid", effect: "vivid", caption: "יום הולדת ראשון" }),

  idea("family-signature", "המשפחה שלנו", "family", "צילום משפחתי גדול ודיוקנאות", 5, "featured", "hero", { styleId: "minimal", caption: "המשפחה שלנו" }),
  idea("generations", "מדור לדור", "family", "דורות ורגעים שמחברים ביניהם", 7, "mosaic", "grid", { styleId: "luxury", caption: "מדור לדור", subtitle: "הסיפור המשפחתי שלנו" }),
  idea("garden-scrapbook", "אלבום גינה", "family", "תמונות טבעיות כמו דפי סקראפבוק", 9, "scatter", "scatter", { borderStyle: "polaroid", effect: "warm" }),
  idea("family-panorama", "פנורמה משפחתית", "family", "רצף רחב של רגעים משותפים", 6, "strip", "strip", { caption: "ביחד זה הכי טוב" }),

  idea("chalaka-before-after", "לפני ואחרי", "chalaka", "שני רגעים משני צדי התספורת", 2, "grid", "story", { styleId: "luxury", decorId: "chalaka", caption: "החלאקה שלי" }),
  idea("chalaka-story", "סיפור החלאקה", "chalaka", "רצף הטקס מההתחלה ועד החיוך", 8, "featured", "hero", { decorId: "chalaka", caption: "בן שלוש למצוות" }),
  idea("honey-letters", "אותיות ודבש", "chalaka", "רגעים מתוקים מהטקס", 4, "grid", "grid", { styleId: "luxury", decorId: "chalaka", caption: "תורה ציווה לנו" }),

  idea("birthday-confetti", "קונפטי יום הולדת", "celebrations", "תמונות שמחות בקצב חופשי", 8, "scatter", "scatter", { borderStyle: "polaroid", decorId: "birthday1", effect: "vivid", caption: "יום הולדת שמח" }),
  idea("bat-mitzvah", "בת מצווה אלגנטית", "celebrations", "פריסה חגיגית עם תמונה מובילה", 6, "featured", "hero", { styleId: "luxury", caption: "בת מצווה שמחה", subtitle: "היום המיוחד שלי" }),
  idea("candle-story", "סיפור של אורות", "celebrations", "רצף תמונות חגיגי ורחב", 12, "strip", "strip", { styleId: "luxury", caption: "אור ואהבה" }),
  idea("celebration-magazine", "שער מגזין", "celebrations", "צילום נועז וכותרת גדולה", 4, "featured", "story", { styleId: "minimal", caption: "היום כולו שלי" }),

  idea("rosh-hashana", "שנה מתוקה", "holidays", "תמונות חג עם מסגרת עדינה", 6, "mosaic", "grid", { styleId: "luxury", caption: "שנה טובה ומתוקה" }),
  idea("hanukkah-lights", "שמונה אורות", "holidays", "שמונה תמונות כמו נרות", 8, "strip", "strip", { styleId: "luxury", caption: "חנוכה שמח" }),
  idea("purim-grid", "תחפושות לאורך השנים", "holidays", "רשת צבעונית של זיכרונות", 9, "grid", "grid", { effect: "vivid", caption: "פורים שמח" }),
  idea("shabbat-table", "שולחן שבת", "holidays", "תמונה רחבה ופרטי אווירה", 4, "featured", "hero", { styleId: "luxury", caption: "שבת שלום" }),

  idea("white-space", "גלריה לבנה", "editorial", "מרווחים נדיבים ומראה יוקרתי", 3, "strip", "strip", { styleId: "minimal", shape: "rect", caption: "הרגעים שלנו" }),
  idea("black-white-duet", "שחור לבן", "editorial", "שתי תמונות דרמטיות ונקיות", 2, "grid", "story", { styleId: "minimal", effect: "bw", shape: "rect", caption: "פשוט יפה" }),
  idea("floating-grid", "רשת מרחפת", "editorial", "מסגרות עם אוויר וקצב", 7, "mosaic", "grid", { styleId: "minimal", borderStyle: "polaroid" }),
  idea("organic-shapes", "צורות אורגניות", "editorial", "חיתוכים רכים בסגנון אמנותי", 6, "mosaic", "circle", { shape: "blob", caption: "אמנות של רגע" }),
  idea("arches", "קשתות סטודיו", "editorial", "קשתות מחמיאות לצילומי סטודיו", 4, "grid", "circle", { shape: "arch", styleId: "minimal" }),
  idea("classic-postcard", "גלויה קלאסית", "editorial", "תמונה וכיתוב שנראים כמו מזכרת", 1, "featured", "story", { styleId: "minimal", borderStyle: "polaroid", caption: "נשלח באהבה" }),
];