// Shared step labels for the two StepTracker breadcrumbs — kept in one
// place so the admin pages and the client's own gallery pages can't drift.
export const CLIENT_STEPS = [
  "סיום תשלום",
  "בחירת תמונות",
  "כיתובים, קולאז' וכריכה",
  "אישור אלבום",
];

export const PRODUCTION_STEPS = [
  "שליחת תמונות",
  "עיבוד תמונות",
  "עיצוב אלבום",
  "תיקונים",
  "הדפסה",
  "מסירה ללקוחה",
];

/** What the client should do right now, per CLIENT_STEPS step (shown under the tracker). */
export const CLIENT_STEP_HINTS = [
  "אחרי סיום התשלום אפתח לך את התמונות לבחירה 💗",
  "עכשיו תורך: לוחצים על הלב בתמונות שאהבת, ובסוף שולחים לי את הבחירה",
  "ממלאים את הפרטים לעיצוב האלבום — כיתובים, תמונות לקולאז' וכריכה",
  "האלבום מוכן לאישור שלך — עוברים עליו ומאשרים",
];
