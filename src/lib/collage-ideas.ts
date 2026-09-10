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
  | "wedding"
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
  { id: "wedding", label: "חתונה" },
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
  // The next 4 mirror templates that used to live only in "סטודיו קולאז'ים"
  // (the fabric.js free-canvas editor) — ported here as preset "ideas" for
  // this simpler tool too, per explicit request, so every layout that
  // existed before is reachable from this step, not only from /collage-canvas.
  idea("our-moments", "הרגעים שלנו", "family", "תמונה גדולה למעלה וכמה רגעים קטנים מתחת", 4, "featured", "hero", { styleId: "minimal", shape: "rect", caption: "הרגעים שלנו", subtitle: "המשפחה שלנו" }),
  idea("our-album", "האלבום שלנו", "family", "שש תמונות בפריסת אלבום א-סימטרית", 6, "mosaic", "grid", { styleId: "minimal", shape: "rect", caption: "האלבום שלנו" }),
  idea("our-smile", "החיוך שלנו", "family", "שתי תמונות נקיות עם כיתוב לצד", 2, "featured", "hero", { styleId: "minimal", caption: "החיוך שלנו", subtitle: "הרגעים הקטנים" }),
  idea("our-family-portrait", "המשפחה שלנו", "family", "תמונה יחידה עם מסגרת דקה קלאסית", 1, "featured", "story", { styleId: "minimal", shape: "rect", caption: "המשפחה שלנו", subtitle: "יחד זה הבית" }),

  idea("chalaka-before-after", "לפני ואחרי", "chalaka", "שני רגעים משני צדי התספורת", 2, "grid", "story", { styleId: "luxury", decorId: "chalaka", caption: "החלאקה שלי" }),
  idea("chalaka-story", "סיפור החלאקה", "chalaka", "רצף הטקס מההתחלה ועד החיוך", 8, "featured", "hero", { decorId: "chalaka", caption: "בן שלוש למצוות" }),
  idea("honey-letters", "אותיות ודבש", "chalaka", "רגעים מתוקים מהטקס", 4, "grid", "grid", { styleId: "luxury", decorId: "chalaka", caption: "תורה ציווה לנו" }),
  idea("my-chalaka", "החלאקה שלי", "chalaka", "חמש תמונות עם פרחי זהב בפינות", 5, "mosaic", "grid", { shape: "rect", decorId: "chalaka", caption: "החלאקה שלי", subtitle: "היום המיוחד שלי" }),

  idea("birthday-confetti", "קונפטי יום הולדת", "celebrations", "תמונות שמחות בקצב חופשי", 8, "scatter", "scatter", { borderStyle: "polaroid", decorId: "birthday1", effect: "vivid", caption: "יום הולדת שמח" }),
  idea("bat-mitzvah", "בת מצווה אלגנטית", "celebrations", "פריסה חגיגית עם תמונה מובילה", 6, "featured", "hero", { styleId: "luxury", caption: "בת מצווה שמחה", subtitle: "היום המיוחד שלי" }),
  idea("candle-story", "סיפור של אורות", "celebrations", "רצף תמונות חגיגי ורחב", 12, "strip", "strip", { styleId: "luxury", caption: "אור ואהבה" }),
  idea("celebration-magazine", "שער מגזין", "celebrations", "צילום נועז וכותרת גדולה", 4, "featured", "story", { styleId: "minimal", caption: "היום כולו שלי" }),
  idea("from-the-heart", "ברכה מכל הלב", "celebrations", "תמונה יחידה בקשת על רקע כהה ויוקרתי", 1, "featured", "story", { styleId: "luxury", shape: "arch", caption: "מכל הלב", subtitle: "מתנה שנשארת לתמיד" }),
  idea("bat-mitzvah-portrait", "בת המצווה שלי", "celebrations", "תמונה מרכזית ושני רגעים לצידה על רקע כהה", 4, "featured", "hero", { styleId: "luxury", caption: "בת מצווה שמחה" }),
  idea("birthday-trio", "יום הולדת שמח", "celebrations", "תמונה גבוהה ושני רגעים לצידה", 3, "featured", "hero", { decorId: "birthday1", effect: "vivid", caption: "יום הולדת שמח" }),

  idea("wedding-couple", "מזל טוב", "wedding", "תמונה מרכזית וזוג רגעים מהחתונה", 3, "featured", "hero", { styleId: "luxury", decorId: "wedding", caption: "מזל טוב", subtitle: "לחיים ולאושר" }),
  idea("wedding-story", "סיפור החתונה", "wedding", "רצף רגעים מהיום הגדול", 8, "strip", "strip", { styleId: "luxury", decorId: "wedding", caption: "לחיים ולאושר" }),
  idea("wedding-grid", "רגעים מתחת לחופה", "wedding", "רשת מסודרת של הטקס והחגיגה", 6, "grid", "grid", { styleId: "luxury", decorId: "wedding", caption: "מזל טוב", subtitle: "יום שלם באהבה" }),

  idea("rosh-hashana", "שנה מתוקה", "holidays", "תמונות חג עם מסגרת עדינה", 6, "mosaic", "grid", { styleId: "luxury", decorId: "sweet", caption: "שנה טובה ומתוקה" }),
  idea("good-year", "שנה טובה", "holidays", "שתי תמונות עם דבש ותפוח בפינות", 2, "featured", "hero", { decorId: "sweet", caption: "שנה טובה", subtitle: "שנה של שקט, שמחה והרבה נחת" }),
  idea("hanukkah-lights", "שמונה אורות", "holidays", "שמונה תמונות כמו נרות", 8, "strip", "strip", { styleId: "luxury", caption: "חנוכה שמח" }),
  idea("purim-grid", "תחפושות לאורך השנים", "holidays", "רשת צבעונית של זיכרונות", 9, "grid", "grid", { effect: "vivid", caption: "פורים שמח" }),
  idea("shabbat-table", "שולחן שבת", "holidays", "תמונה רחבה ופרטי אווירה", 4, "featured", "hero", { styleId: "luxury", caption: "שבת שלום" }),

  idea("white-space", "גלריה לבנה", "editorial", "מרווחים נדיבים ומראה יוקרתי", 3, "strip", "strip", { styleId: "minimal", shape: "rect", caption: "הרגעים שלנו" }),
  idea("black-white-duet", "שחור לבן", "editorial", "שתי תמונות דרמטיות ונקיות", 2, "grid", "story", { styleId: "minimal", effect: "bw", shape: "rect", caption: "פשוט יפה" }),
  idea("floating-grid", "רשת מרחפת", "editorial", "מסגרות עם אוויר וקצב", 7, "mosaic", "grid", { styleId: "minimal", borderStyle: "polaroid" }),
  idea("organic-shapes", "צורות אורגניות", "editorial", "חיתוכים רכים בסגנון אמנותי", 6, "mosaic", "circle", { shape: "blob", caption: "אמנות של רגע" }),
  idea("arches", "קשתות סטודיו", "editorial", "קשתות מחמיאות לצילומי סטודיו", 4, "grid", "circle", { shape: "arch", styleId: "minimal" }),
  idea("classic-postcard", "גלויה קלאסית", "editorial", "תמונה וכיתוב שנראים כמו מזכרת", 1, "featured", "story", { styleId: "minimal", borderStyle: "polaroid", caption: "נשלח באהבה" }),
  idea("spring-season", "עונת האביב", "editorial", "ארבע תמונות ברשת עדינה בהשראת האביב", 4, "grid", "grid", { styleId: "minimal", caption: "רגעים שנשארים" }),
];
/**
 * The large library. Every entry below is generated from a themed concept
 * (occasion + wording) crossed with a composition recipe (layout, shape,
 * effect, finish) — the same knobs the wizard exposes, so each preset is a
 * real, distinct starting point rather than decoration. Combined with the
 * hand-written presets above this puts the catalogue at ~300 ideas.
 */
type Theme = {
  key: string;
  name: string;
  caption: string;
  subtitle: string;
  category: CollageIdeaCategory;
  styleId?: CollageStyleId;
  decorId?: DecorThemeId;
};

const THEMES: Theme[] = [
  { key: "moments", name: "רגעים שלנו", caption: "הרגעים שלנו", subtitle: "אוסף קטן של אושר", category: "popular" },
  { key: "smiles", name: "אוסף חיוכים", caption: "החיוכים שלנו", subtitle: "כל יום מחדש", category: "popular" },
  { key: "album", name: "אלבום זיכרונות", caption: "אלבום הזיכרונות", subtitle: "לשמור לתמיד", category: "popular" },
  { key: "love", name: "מלא אהבה", caption: "ממני באהבה", subtitle: "בכל הלב", category: "popular" },
  { key: "summer", name: "קיץ שלנו", caption: "הקיץ שלנו", subtitle: "שמש, ים ואור", category: "popular" },
  { key: "everyday", name: "יומיום מתוק", caption: "היומיום המתוק", subtitle: "רגעים קטנים וגדולים", category: "popular" },

  { key: "welcome", name: "ברוך הבא", caption: "ברוכים הבאים לעולם", subtitle: "קטן כל כך, אהוב כל כך", category: "newborn", decorId: "newborn" },
  { key: "tiny", name: "פרטים זעירים", caption: "אהבה בפרטים הקטנים", subtitle: "ידיים, רגליים, נשימה", category: "newborn", decorId: "newborn" },
  { key: "sleepy", name: "חלומות רכים", caption: "חלומות מתוקים", subtitle: "שקט של תינוק", category: "newborn", decorId: "newborn" },
  { key: "firstdays", name: "הימים הראשונים", caption: "הימים הראשונים שלי", subtitle: "התחלה חדשה", category: "newborn", decorId: "newborn" },
  { key: "namecard", name: "כרטיס שם", caption: "נעים להכיר", subtitle: "שם · תאריך · משקל", category: "newborn", styleId: "minimal", decorId: "newborn" },
  { key: "wrapped", name: "עטוף באהבה", caption: "עטוף באהבה", subtitle: "רך, חמים ובטוח", category: "newborn", decorId: "newborn" },

  { key: "months", name: "חודש אחרי חודש", caption: "השנה הראשונה שלי", subtitle: "12 חודשים של אהבה", category: "first-year", decorId: "birthday1" },
  { key: "growing", name: "כמה גדלתי", caption: "כמה גדלתי", subtitle: "מיום ליום", category: "first-year", decorId: "birthday1" },
  { key: "firsttime", name: "פעם ראשונה", caption: "כל הפעמים הראשונות", subtitle: "צעד, חיוך, מילה", category: "first-year", decorId: "birthday1" },
  { key: "cake", name: "עוגה ראשונה", caption: "יום הולדת ראשון", subtitle: "מתוק כמו שאני", category: "first-year", decorId: "birthday1" },
  { key: "oneyear", name: "בן שנה", caption: "אני בן שנה", subtitle: "שנה של אושר", category: "first-year", decorId: "birthday1" },
  { key: "milestones", name: "אבני דרך", caption: "אבני הדרך שלי", subtitle: "כל רגע נחשב", category: "first-year", decorId: "birthday1" },

  { key: "ourfamily", name: "המשפחה שלנו", caption: "המשפחה שלנו", subtitle: "הבית שלנו", category: "family", styleId: "minimal" },
  { key: "siblings", name: "אחים ואחיות", caption: "אחים ואחיות", subtitle: "ביחד תמיד", category: "family" },
  { key: "generations", name: "מדור לדור", caption: "מדור לדור", subtitle: "הסיפור המשפחתי", category: "family", styleId: "luxury" },
  { key: "grandma", name: "לסבתא וסבא", caption: "לסבתא וסבא האהובים", subtitle: "באהבה גדולה", category: "family" },
  { key: "hometime", name: "זמן בבית", caption: "הזמן שלנו בבית", subtitle: "רגעים פשוטים", category: "family" },
  { key: "trip", name: "טיול משפחתי", caption: "הטיול שלנו", subtitle: "יוצאים להרפתקה", category: "family" },

  { key: "chalaka", name: "החלאקה שלי", caption: "החלאקה שלי", subtitle: "בן שלוש", category: "chalaka", decorId: "chalaka" },
  { key: "threeyears", name: "בן שלוש", caption: "בן שלוש למצוות", subtitle: "יום גדול", category: "chalaka", decorId: "chalaka", styleId: "luxury" },
  { key: "beforeafter", name: "לפני ואחרי", caption: "לפני ואחרי", subtitle: "רגע השינוי", category: "chalaka", decorId: "chalaka" },
  { key: "honey", name: "אותיות ודבש", caption: "תורה ציווה לנו", subtitle: "מתוק כמו דבש", category: "chalaka", decorId: "chalaka" },
  { key: "ceremony", name: "רגעי הטקס", caption: "רגעי הטקס", subtitle: "משפחה וברכות", category: "chalaka", decorId: "chalaka" },
  { key: "curls", name: "התלתלים שלי", caption: "התלתלים שלי", subtitle: "מזכרת קטנה", category: "chalaka", decorId: "chalaka" },

  { key: "birthday", name: "יום הולדת", caption: "יום הולדת שמח", subtitle: "חוגגים אותך", category: "celebrations", decorId: "birthday1" },
  { key: "batmitzva", name: "בת מצווה", caption: "בת מצווה שמחה", subtitle: "היום המיוחד שלי", category: "celebrations", styleId: "luxury" },
  { key: "barmitzva", name: "בר מצווה", caption: "בר מצווה שמח", subtitle: "מזל טוב", category: "celebrations", styleId: "luxury" },
  { key: "party", name: "מסיבה", caption: "מסיבה שלא נשכח", subtitle: "צחוק, ריקוד, אושר", category: "celebrations" },
  { key: "friends", name: "לחברות", caption: "לחברה הכי טובה", subtitle: "תודה שאת שלי", category: "celebrations" },
  { key: "thanks", name: "תודה", caption: "תודה מכל הלב", subtitle: "מזכרת קטנה", category: "celebrations" },

  { key: "wedding", name: "החתונה שלנו", caption: "מזל טוב", subtitle: "לחיים ולאושר", category: "wedding", styleId: "luxury", decorId: "wedding" },
  { key: "chuppah", name: "מתחת לחופה", caption: "מתחת לחופה", subtitle: "יום שלם באהבה", category: "wedding", styleId: "luxury", decorId: "wedding" },
  { key: "bride", name: "הכלה", caption: "יפה כל כך", subtitle: "היום הגדול שלי", category: "wedding", decorId: "wedding" },
  { key: "toast", name: "לחיים", caption: "לחיים ולאושר", subtitle: "מזל טוב לזוג", category: "wedding", decorId: "wedding" },

  { key: "shanatova", name: "שנה טובה", caption: "שנה טובה ומתוקה", subtitle: "שתהיה שנה של אור", category: "holidays", styleId: "luxury", decorId: "sweet" },
  { key: "hanukkah", name: "חנוכה", caption: "חנוכה שמח", subtitle: "שמונה נרות של אור", category: "holidays", styleId: "luxury" },
  { key: "purim", name: "פורים", caption: "פורים שמח", subtitle: "תחפושות וצחוק", category: "holidays" },
  { key: "pesach", name: "פסח", caption: "חג פסח שמח", subtitle: "חג של חירות", category: "holidays" },
  { key: "shabbat", name: "שבת שלום", caption: "שבת שלום", subtitle: "שולחן, אור ומשפחה", category: "holidays", styleId: "luxury" },
  { key: "sukkot", name: "סוכות", caption: "חג סוכות שמח", subtitle: "בסוכה שלנו", category: "holidays" },

  { key: "editorial", name: "גלריה נקייה", caption: "הרגעים שלנו", subtitle: "פשוט יפה", category: "editorial", styleId: "minimal" },
  { key: "monochrome", name: "מונוכרום", caption: "שחור לבן", subtitle: "אור וצל", category: "editorial", styleId: "minimal" },
  { key: "poster", name: "פוסטר קיר", caption: "אמנות של רגע", subtitle: "להדפסה ולתלייה", category: "editorial", styleId: "minimal" },
  { key: "magazine", name: "שער מגזין", caption: "היום כולו שלי", subtitle: "כותרת גדולה", category: "editorial", styleId: "minimal" },
  { key: "studio", name: "סטודיו", caption: "צילומי סטודיו", subtitle: "אור רך ונקי", category: "editorial", styleId: "minimal" },
  { key: "artcut", name: "חיתוכים אמנותיים", caption: "צורות ואור", subtitle: "קומפוזיציה חופשית", category: "editorial" },
];

type Recipe = {
  key: string;
  suffix: string;
  description: string;
  photoCount: number;
  layoutId: string;
  motif: CollageIdea["motif"];
  shape: PhotoShapeId;
  effect: PhotoEffectId;
  borderStyle: "none" | "polaroid";
};

const RECIPES: Recipe[] = [
  { key: "hero", suffix: "תמונה מובילה", description: "תמונה גדולה ורגעים קטנים סביבה", photoCount: 5, layoutId: "featured", motif: "hero", shape: "rounded", effect: "none", borderStyle: "none" },
  { key: "grid6", suffix: "רשת קלאסית", description: "שש תמונות מסודרות בקצב אחיד", photoCount: 6, layoutId: "grid", motif: "grid", shape: "rounded", effect: "none", borderStyle: "none" },
  { key: "grid9", suffix: "רשת גדולה", description: "תשע תמונות למזכרת מלאה", photoCount: 9, layoutId: "grid", motif: "grid", shape: "rect", effect: "none", borderStyle: "none" },
  { key: "polaroid", suffix: "פולארויד", description: "ערימת תמונות מודפסות ושובבה", photoCount: 6, layoutId: "scatter", motif: "scatter", shape: "rect", effect: "warm", borderStyle: "polaroid" },
  { key: "strip", suffix: "סרט צילום", description: "רצף קולנועי נקי", photoCount: 4, layoutId: "strip", motif: "strip", shape: "rect", effect: "none", borderStyle: "none" },
  { key: "mosaic", suffix: "מוזאיקה", description: "קומפוזיציה לא סימטרית ומדויקת", photoCount: 7, layoutId: "mosaic", motif: "grid", shape: "rounded", effect: "none", borderStyle: "none" },
  { key: "circles", suffix: "עיגולים", description: "חיתוכים עגולים ורכים", photoCount: 6, layoutId: "grid", motif: "circle", shape: "circle", effect: "soft", borderStyle: "none" },
  { key: "arch", suffix: "קשתות", description: "קשתות מחמיאות לצילומי סטודיו", photoCount: 4, layoutId: "grid", motif: "circle", shape: "arch", effect: "none", borderStyle: "none" },
  { key: "single", suffix: "תמונה אחת", description: "תמונה אחת גדולה עם כיתוב", photoCount: 1, layoutId: "featured", motif: "story", shape: "rounded", effect: "none", borderStyle: "none" },
  { key: "bw", suffix: "שחור לבן", description: "מראה קלאסי ודרמטי", photoCount: 4, layoutId: "mosaic", motif: "grid", shape: "rect", effect: "bw", borderStyle: "none" },
  { key: "vintage", suffix: "וינטג׳", description: "גוונים חמים כמו תמונות ישנות", photoCount: 5, layoutId: "scatter", motif: "scatter", shape: "rect", effect: "warm", borderStyle: "polaroid" },
  { key: "hearts", suffix: "לבבות", description: "חיתוכי לב לרגעים מתוקים", photoCount: 3, layoutId: "strip", motif: "strip", shape: "heart", effect: "soft", borderStyle: "none" },
];

const usedIds = new Set(COLLAGE_IDEAS.map((item) => item.id));

for (const theme of THEMES) {
  for (const recipe of RECIPES) {
    const id = `${theme.key}-${recipe.key}`;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    COLLAGE_IDEAS.push({
      id,
      name: `${theme.name} · ${recipe.suffix}`,
      category: theme.category,
      description: recipe.description,
      photoCount: recipe.photoCount,
      layoutId: recipe.layoutId,
      motif: recipe.motif,
      styleId: theme.styleId ?? "floral",
      shape: recipe.shape,
      effect: recipe.effect,
      borderStyle: recipe.borderStyle,
      decorId: theme.decorId ?? "none",
      caption: theme.caption,
      subtitle: theme.subtitle,
    });
  }
}
