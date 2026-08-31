/** Shared constants for photography sessions with Michal (client + server safe). */
export const PHOTOGRAPHY_HOURLY_RATE = 300;

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "מזומן בסטודיו",
  transfer: "העברה בנקאית",
  bit: "ביט / פייבוקס",
  later: "סגירה טלפונית עם הצלמת",
};

/**
 * On-demand detail for the AI bots (site chat + voice — see
 * get_photography_service_info in ai-tools.server.ts) about Michal's OWN
 * photography services, as distinct from the studio-rental business: the
 * same phone number (054-8529277) that customers call for studio rental
 * also reaches Michal Sibony personally as a photographer who shoots
 * newborn/family sessions herself, in the studio or on location.
 *
 * Package pricing/inclusions beyond what's below aren't hardcoded here on
 * purpose — never invent specifics the bot doesn't actually have (SYSTEM's
 * own rule). Point an interested customer to email/phone or the full page
 * for anything more specific than this.
 */
export const PHOTOGRAPHY_SERVICE_TEXT_HE = [
  "צילומים עם הצלמת מיכל סיבוני (בעלת הסטודיו) — שירות נפרד מהשכרת הסטודיו: מיכל עצמה מצלמת ניו-בורן ומשפחה, גם בסטודיו וגם בחוץ (בטבע/לוקיישן לפי בחירה).",
  `מחיר בסטודיו: ${PHOTOGRAPHY_HOURLY_RATE}₪ לשעה, אפשרות לחצי שעה (150₪), בניית סטים נוספים +100₪ — בדרך כלל כ-2 סטים בסשן של כשעה.`,
  "יש גם חבילת ניו-בורן הכוללת אלבום, שאפשר לממן דרך 'סל לידה' (הטבת קופת חולים) — רלוונטי רק למבוטחות כללית, לאומית או מכבי (לא קופות אחרות). לפרטים מדויקים על החבילה הזו (מה בדיוק כלול, עלות בפועל) — אין למכור/להתחייב על מספרים, יש להפנות ליצירת קשר ישיר עם מיכל.",
  "צילומי חוץ (בטבע/לוקיישן): מתואמים אישית — הכי נכון להפנות ליצירת קשר במייל.",
  "יצירת קשר: s0548529277@gmail.com · 054-8529277 (אותו מספר של הסטודיו) · עמוד מלא עם גלריה וקביעת תור ביומן: /studio-photography · אתר נוסף של מיכל: https://michalsiboni.co.il/",
].join("\n");
