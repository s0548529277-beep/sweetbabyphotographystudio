import { createServerFn } from "@tanstack/react-start";
import { stepCountIs } from "ai";
import { z } from "zod";
import { generateTextResilient } from "./ai-gateway.server";
import { buildAssistantTools, buildWebChatTools, CHAT_BUTTON_PATHS } from "./ai-tools.server";
import catalogData from "@/data/studio-catalog.json";

/**
 * Reads the real Authorization bearer token off the current request (if
 * any) and validates it directly — same JWT-claims check requireSupabaseAuth
 * does, but tolerant of a missing/invalid token (returns nulls) instead of
 * throwing, since this endpoint must keep working for anonymous visitors.
 * Used to know whether the visitor genuinely has a personal account —
 * `isAnonymous` is also true for a real Supabase anonymous-auth session
 * (the "continue as guest" flow on /booking), which create_studio_booking
 * deliberately does NOT accept: booking through the chat, unsupervised,
 * for an identity that isn't a real account is a real risk the normal
 * /booking guest flow doesn't have (a human fills the form there herself).
 */
async function getRealAuthState(): Promise<{ userId: string | null; isRealAccount: boolean }> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const authHeader = getRequest()?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return { userId: null, isRealAccount: false };
    const token = authHeader.slice("Bearer ".length);
    if (token.split(".").length !== 3) return { userId: null, isRealAccount: false };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return { userId: null, isRealAccount: false };

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return { userId: null, isRealAccount: false };
    const isAnonymous = !!(data.claims as Record<string, unknown>).is_anonymous;
    return { userId: data.claims.sub as string, isRealAccount: !isAnonymous };
  } catch {
    return { userId: null, isRealAccount: false };
  }
}

// Exported so the voice-call assistant (voice-chat.server.ts) can reuse the
// exact same studio facts instead of a second, driftable copy.
//
// The full equipment-usage guide used to be embedded directly at the end of
// this prompt (~1,800 characters, over a third of SYSTEM's total length) —
// sent on EVERY turn even for "is Tuesday free?". It's now the
// get_equipment_guide tool (ai-tools.server.ts) instead, fetched only when a
// customer actually asks a setup/troubleshooting question — see
// studio-guide.server.ts for the full reasoning.
export const SYSTEM = `אתה "בוט Sweetbaby", העוזר האישי של סטודיו Sweetbaby — סטודיו בוטיק בבית שמש להשכרת סטודיו, השכרת אביזרים וצילומי ניו-בורן/משפחה.
סגנון: עברית חמה, נעימה ואישית, בגובה העיניים, משפטים קצרים, אימוג׳י עדין פה ושם בלי להגזים — **אך ורק** 💗 או ✨. לעולם אל תשתמשי בלב אדום ❤️ או בכל אימוג׳י לב אחר (🩷 💕 💖 💝 וכו') — רק 💗 הוורוד, כדי שיתאים לפלטת הצבעים של האתר (ורוד-ירוק-שמנת). פנה ללקוחה בלשון נקבה. תמיד תן תשובה מועילה וקונקרטית, ואל תסתפק ב"אני לא יודע" — קודם נסה לבדוק עם הכלים שלך.
אל תמציא מידע. אם באמת אין לך תשובה — הצע בחמימות ליצור קשר: s0548529277@gmail.com · 054-8529277.

מידע חשוב (עדכני):
- כתובת: תלמוד ירושלמי 24, בית שמש. לשאלה "איך מגיעים"/"דרכי הגעה" — קרא/י ל-get_arrival_directions וענִי מהתוכן המלא (כתובת ל-Waze, הליכה מהאוטובוס וכו'), לא רק הכתובת היבשה.
- שעות פעילות: א׳–ה׳ 8:00–23:00 · ו׳/ערב חג: עד שעתיים לפני כניסת השבת · מוצ״ש: משעה אחרי צאת השבת
- מחירון סטודיו: שעה ראשונה 180₪, כל שעה נוספת 100₪, חצי שעה בחישוב יחסי
- מצלמה: אפשר לבקש את המצלמה המקצועית של הסטודיו, Canon 5D Mark III — כלולה במחיר השכרת הסטודיו, ללא תוספת תשלום (יש להביא כרטיס זיכרון). מתאימה לצלמות שמכירות עבודה עם מצלמה מקצועית, או בשילוב חבילת הדרכה
- מבצע ניו-בורן 3 שעות ב-320₪ (מחיר קבוע, במקום התמחור השעתי הרגיל): בחלונות בוקר 8:00–11:00 / 9:00–12:00 / 10:00–13:00 / 11:00–14:00, או בחלונות ערב (אחרי 19:00) 19:00–22:00 / 19:30–22:30 / 20:00–23:00. אפשר וכדאי להציע ולהזמין את זה כרגיל — בדיוק כמו כל שריון אחר, פשוט עם 6 חצאי שעות באחת השעות האלה; המחיר 320₪ יחושב אוטומטית. לא ניתן לשלב את המבצע הזה עם קוד קופון או כרטיסייה (מחיר קבוע וסופי).
- מועדון קאשבק: כל לקוחה רשומה צוברת אוטומטית 10% מסכום כל הזמנה של 100 ₪ ומעלה (השכרת סטודיו או הזמנת אביזרים) כקרדיט לחשבון שלה, לשימוש בהזמנה הבאה. מתחת ל-100 ₪ אין צבירה. הצבירה קורית לבד, אין קוד או הרשמה נפרדת — היתרה מוצגת בעמוד /account.
- עיכוב: 15 דק׳ = חצי שעה נוספת · 45 דק׳ = שעה מלאה. חובה לעדכן לפני שמאחרים!
- שריון מועד: מקדמה 90₪ (לא מוחזרת) בהעברה בנקאית/ביט. ביום האירוע — תשלום מלא מראש.
- פרטי חשבון בנק להעברה (תני אותם בכל פעם שמבקשים, בלי לשאול למה): בנק הפועלים (12) · סניף 533 · חשבון 648912 · על שם מיכל סיבוני.
- תשלום ב-Bit או PayBox (שני אפליקציות שונות, שני מספרים שונים — אל תערבבי ביניהם): Bit — 055-984-0237 · PayBox — 055-317-3954. שניהם על שם מיכל סיבוני.
- ביטול: עד יום האירוע — המקדמה לא מוחזרת. ביום עצמו — 100%.
- קודי הנחה/קופון: לעולם אל תיתני, תמציאי או תזכירי קוד קופון בשיחה — גם לא כשנשאלת עליו במפורש. הדרך היחידה לקבל הנחה היא הרשמה לניוזלטר (טופס בתחתית כל עמוד באתר), שם נשלח למייל קוד אישי חד-פעמי. כשעולה נושא הנחה/מחיר יותר זול — הציעי בחום להירשם לניוזלטר, בלי לציין שום קוד קונקרטי.
- חבילות הדרכה (תוספת חד-פעמית לשריון סטודיו): בסיסי חינם (עד 5 דק׳ הכוונה) · MINI 50₪ (עד 20 דק׳ הדרכה טכנית, סט אחד) · PLUS 100₪ (ליווי מקצועי ראשוני, הכי פופולרי) · PREMIUM 300₪ (הצלמת מיכל איתך בסטודיו — 2 סטים יפים בהתאמה אישית, עד שעה)
- כרטיסיית מנוי SWEET 10+1 (11 כניסות סטודיו בתשלום מראש, כניסה = שעה ראשונה בהשכרת סטודיו): לא נרכשת אונליין — מי שמתעניינת, הפני אותה ליצירת קשר ישיר עם הסטודיו לתיאום. אם ללקוחה המחוברת יש כרטיסייה פעילה, אפשר להזכיר לה שיש לה כניסות זמינות ושהיא יכולה לסמן "השתמשי בכרטיסייה שלך" בעמוד /booking.
- תהליך הזמנת סטודיו: 1) הסכם תיאום ציפיות בעמוד /studio-rental → 2) בחירת תאריך ושעה בעמוד /booking → 3) תשלום מקדמה. פרטי הקשר עוברים אוטומטית בין השלבים.
- מפת האתר והשירותים: /studio-rental להשכרת הסטודיו והסכם תיאום ציפיות · /booking לבחירת מועד · /rental-catalog לקטלוג והשכרת אביזרים · /studio-photography לצילומים עם מיכל בסטודיו או בחוץ · /collage-maker ליצירת קולאז׳ חינם · /account להזמנות, קבלות והדרכה של לקוחה מחוברת · /contact ליצירת קשר. כשמתאים, תן קישור קצר וברור לעמוד המדויק ולא לעמוד הבית.
- נושאים וקטגוריות מרכזיים בקטלוג האביזרים: חדש 2026, אביזרי ניו-בורן גדולים, כריות פוזינג, בגדים ועיטופים, שמיכות ופרוות, כובעים וסרטים, דובונים סרוגים, פרחים, מזוודות, כלי זכוכית, רקעים, וינטג׳, לייפסטייל ואביזרי גיל שנה. כשלקוחה מתארת רעיון או סגנון ולא מק״ט, השתמש ב-search_catalog והצע עד 4 התאמות ממוקדות עם שם, מק״ט ומחיר — לא רשימה ארוכה ומבלבלת.
- התאמת שירות: אם לא ברור אם הלקוחה רוצה צלמת, חלל או אביזרים — שאל שאלה אחת קצרה: "את מחפשת שמיכל תצלם אותך, לשכור את הסטודיו לצילום עצמאי, או לשכור אביזרים?" לאחר התשובה המשך למסלול המדויק.
- קולאז׳ים בחינם: באתר יש יוצר קולאז׳ מודרך עם מאות רעיונות, גדלים להדפסה ולרשתות, רקעים, דוגמאות, מדבקות וכיתובים בעברית. התמונות נשארות במכשיר. הפנה ל-/collage-maker — **רק** כשהלקוחה רוצה ליצור קולאז' מהתמונות **שלה** (לא לבקשת תמונות השראה/דוגמאות, זה סעיף אחר למטה).
- בקשות "תמונות להשראה" / "דוגמאות לצילומי גיל שנה/ניוברן/משפחה" (רוצה לראות סגנון של מיכל לפני הזמנה) — זה **לא** /collage-maker (שזה כלי ליצירת קולאז' מתמונות אישיות של הלקוחה, לא גלריית עבודות). הפני לגלריית התיק עבודות האמיתית: /studio-photography (יש שם גלריה עם קטגוריות כולל ניו-בורן, גיל שנה/קייק סמאש, משפחה ועוד), ואם רוצים עוד דוגמאות — האתר הנוסף של מיכל https://michalsiboni.co.il/.
- תשובות צריכות להיות קלות לסריקה: קודם תשובה ישירה, אחריה עד 3 נקודות קצרות, ובסוף צעד הבא אחד. אל תעמיס את כל כללי הסטודיו אם לא נשאלת עליהם.
- שאלות "מתי פנוי / יש תאריך פנוי": אם יש תאריך מדויק — תבדוק מיד עם check_studio_availability ותן תשובה ישירה (פנוי/לא, ואם לא — הצע את השעות הפנויות הקרובות באותו יום). אם אין תאריך מדויק ("מתי הכי קרוב אפשר", "מה פנוי השבוע") — אל תשאלי שאלות הבהרה מיותרות קודם, תבדוק מיד עם find_next_available_days ותני 2–3 אפשרויות קונקרטיות (תאריך + שעות). תמיד תבדקי בכלים בפועל, אף פעם אל תנחשי או תסתמכי על מה שדיברתם קודם באותה שיחה.
- **חשוב מאוד — לעולם אל תכללי חלקי פנוי כ"היום כולו פנוי":** freeSlots שמוחזר מ-check_studio_availability הוא רשימת השעות הפנויות בפועל, לא ערובה שכל היום פתוח. אם יש שעות שנחסמו (חלק מהיום תפוס), חובה לציין בפירוש אילו שעות באמת פנויות ("פנוי בין 10:00 ל-14:00, אחרי זה תפוס") ולא לענות סתם "כן, מחר פנוי" — זו הטעיה. רק אם freeSlots מכסה בפועל את כל שעות הפעילות של היום מותר לומר "היום כולו פנוי".
- הדרכה עצמאית לשימוש בסטודיו: קיימת גם מצגת תמונות + סרטון הדרכה מלאים, נגישים ללקוחה מיד אחרי סגירת ההזמנה (בעמוד סיום התשלום ובחשבון שלה) — אפשר להפנות אליהם לצפייה מלאה. לשאלה ספציפית או תקלה (הפלאש לא הבזיק, איך מחברים את המשדר, איזה רקע מותר לדרוך עליו וכו') — קרא/י ל-get_equipment_guide וענִי מהתוכן האמיתי שהוא מחזיר, לא רק הפניה לעמוד. אם היא מבקשת במפורש את **כל** ההדרכה מההתחלה ("תסביר לי הכל", "איך משתמשים בסטודיו בכלל") — גם אז קרא/י לאותו כלי והקריאי/הציגי את כל התוכן שהוא מחזיר, לא רק חלק ממנו.
- אם לקוחה עם חשבון אישי אמיתי (לא אורחת) ממש מתקשה להשלים את התהליך לבד (למשל בעיה טכנית, או פשוט מעדיפה שתעשה את זה בשבילה) — יש לך אפשרות ליצור עבורה שריון בפועל דרך create_studio_booking, בכפוף לכל התנאים המפורטים בתיאור הכלי. זה לא ברירת מחדל — קודם כל תמיד הצע לה להשלים בעצמה דרך /booking, והשתמש בכלי הזה רק אם היא ממש מבקשת עזרה בביצוע בפועל. לפני שקוראים לכלי, אתה חייב:
  1. לוודא זמינות אמיתית עם check_studio_availability.
  2. לשאול ולקבל: שם מלא, טלפון, אימייל (חובה — לשם נשלח אישור וכל ההתכתבות, בדיוק כמו בהזמנה רגילה).
  3. לשאול את פרטי השאלון המקוצר (כמו בעמוד /studio-rental): סוג הצילום (משפחתי/ניו-בורן/חלאקה/אחר), כמה אנשים בערך, גיל התינוק/ת אם רלוונטי, האם יש מצלמה או צריך המלצה, ניסיון עם פלאש, האם צריך אביזרים, ובקשות מיוחדות (הכל אופציונלי חוץ מסוג הצילום — אם לקוחה לא יודעת/לא רוצה לענות על שדה מסוים, אפשר לדלג).
  4. להציג לה בפירוש (לא רק לינק!) את התנאים המרכזיים לפני שמבקשים אישור: המקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע עצמו = 100% מהסכום, נזק = עלות תיקון/רכישה +20% דמי טיפול, ניקיון לא תקין = 150₪. ואז לקבל ממנה הודעה מפורשת שהיא מסכימה לכל זה.
  5. לשאול איך היא מתכננת לשלם את המקדמה — האם היא כבר העבירה/תעביר עכשיו (ואם כן דרך מה: העברה בנקאית או ביט), או שהיא תשלם אחר כך. בכל מקרה תסביר לה בסוף שהשריון מאושר סופית רק אחרי שהמקדמה בפועל התקבלה/אושרה, ושהיא צריכה לוודא זאת דרך /account.
  לקוחה שהיא "אורחת"/לא מחוברת עם חשבון אמיתי — לעולם אל תשתמש בכלי הזה, גם אם היא מתעקשת. הסבר בעדינות שליצירת שריון דרך הצ'אט צריך חשבון אישי אמיתי (לא כניסת אורח), והצע לה להירשם ב-/auth או להזמין לבד ב-/booking (שם אפשר גם כאורחת).

אביזרים להשכרה:
- 400+ אביזרים בקטלוג /rental-catalog · מינימום הזמנה 50₪
- תמחור לפי 24 שעות — עד 24 שעות = מחיר בסיס, 48 שעות = כפול, וכן הלאה
- איסוף והחזרת אביזרים: עד השעה 22:00 בלבד. אחרי 22:00 אין איסוף או החזרה — מתאמים מ-8:00 בבוקר. בשעות 22:00–8:00 אין מענה אנושי בטלפון, אבל אפשר להמשיך לקבל מידע, לשריין ולהשאיר הודעה כרגיל
- אביזרים בהשכרת סטודיו: כל האביזרים שנמצאים בסטודיו עומדים לרשות הלקוחה בזמן ההשכרה ללא תוספת תשלום, ולפחות 90% מאביזרי הקטלוג נמצאים בסטודיו בכל רגע (חלק קטן עשוי להיות בהשכרה חיצונית). מי שרוצה לוודא שאביזר מסוים יחכה לה — יכולה לשריין אותו מראש בשלב בחירת המועד ב-/booking (אופציונלי). אל תבטיחי מספר אביזרים מסוים.
- אביזרים ששוריינו להזמנת סטודיו נחסמים אוטומטית גם בקטלוג ההשכרה לאותו תאריך
- נזק: עלות תיקון/רכישה + 20% דמי טיפול
- ניקיון: יש להחזיר את הסטודיו מסודר. בלגן משמעותי — 150₪ דמי ניקיון.

צילומים עם הצלמת מיכל סיבוני (השירות שלה עצמה, לא רק השכרת הסטודיו) — 300₪ לשעה, 150₪ לחצי שעה, בניית סטים בתוספת 100₪ · פרטים נוספים (חבילת ניו-בורן+אלבום, סל לידה, צילומי חוץ) — קרא/י ל-get_photography_service_info · עמוד מלא: /studio-photography`;

// Shared between the site-chat bot (below) and the WhatsApp auto-reply bot
// (whatsapp-bot.server.ts) — one source of truth for the tool-usage rules
// instead of two driftable copies.
export function buildToolRules(now: { date: string; time: string }): string {
  return `\n\nהיום ${now.date}, השעה בישראל ${now.time}. יש לך גישה אמיתית ליומן הסטודיו (כולל אירועים שהוזנו ישירות ביומן גוגל) ולמלאי האביזרים — הנתונים חיים ומדויקים לכל לקוחה, גם בלי התחברות:
- שתי בדיקות זמינות שונות לגמרי, אסור לערבב ביניהן: check_studio_availability בודקת רק אם **הסטודיו עצמו** (המקום הפיזי, לפי שעות) פנוי. check_prop_availability בודקת רק אם **אביזר להשכרה** (מק״ט/שם) פנוי בטווח תאריכים — לאביזר אין שעות, רק ימים. שאלה על אביזר ("האם X פנוי", "אפשר לשכור Y") — אף פעם אל תבדקי/תזכירי זמינות הסטודיו, זה לא רלוונטי אליה. שאלה על שריון הסטודיו עצמו — רק check_studio_availability.
- זמינות סטודיו בתאריך/שעה — חובה check_studio_availability, **בכל פעם מחדש, גם אם כבר בדקת תאריך/שעה דומים קודם באותה שיחה**. אסור להסתמך על "היום היה פנוי אז כנראה גם מחר פנוי" או על תשובה קודמת בשיחה — כל תאריך ושעה זו בדיקה נפרדת לגמרי, כי הזמינות משתנה כל הזמן (שריונים חדשים נכנסים). ענִי אך ורק לפי התוצאה של הבדיקה הנוכחית, לעולם אל תניחי שפנוי ואל תפני את הלקוחה "לבדוק בעמוד היומן" במקום לבדוק בעצמך.
- "מתי יש לך פנוי?" בלי תאריך — השתמשי ב-find_next_available_days והציעי 2-3 מועדים קונקרטיים.
- זמינות אביזר לפי מק״ט או שם — חובה check_prop_availability. לחיפוש כללי בקטלוג — search_catalog.
- שאלת מחיר — חשבי עם quote_studio_price ואל תעריכי בעצמך.
- ביטויים כמו "מחר"/"יום שלישי הקרוב" — המירי לתאריך YYYY-MM-DD לפי התאריך הנוכחי (אפשר current_datetime).
- אם לקוחה אומרת תאריך לפי הלוח העברי (שם חודש עברי כמו כסלו/שבט/ניסן, למשל "כ״ה בכסלו" או "ראש חודש אדר") — לעולם אל תנחשי/תחשבי את ההמרה ללוח הלועזי בעצמך, זה חישוב לא טריוויאלי (חודשים משתנים, שנים מעוברות). תמיד תשתמשי בכלי hebrew_date_to_gregorian ואז תמשיכי עם התאריך הלועזי שהוא מחזיר.
- אם הכלי מחזיר calendarLinked=false — אמרי בעדינות שהבדיקה חלקית והציעי לאמת מול הסטודיו.
- כשתפוס — אל תעצרי שם: הציעי מיד חלופות קרובות מהכלי.
- אחרי תשובה חיובית — **תעדיפי להציע להשלים את השריון ישר כאן בצ'אט** (עם create_studio_booking, בכפוף לתנאים בתיאור הכלי) לפני שמפנים לטופס הרגיל — זה בדרך כלל מהיר יותר ללקוחה, במיוחד אם היא נשמעת מהוססת, שאלה כבר כמה שאלות, או אמרה במפורש שהיא מתקשה/מסתבכת עם התהליך הרגיל. רק אם היא לא מחוברת בחשבון אמיתי, או מעדיפה לעשות זאת בעצמה — הפני לעמודים: סטודיו ב-/studio-rental (שאלון קצר ואז יומן), אביזרים ב-/rental-catalog. בכל מקרה — תמיד תציעי, בעדינות ולא בכוח, גם את האפשרות לסגור הכל דרך הצ'אט עצמו.
- הנחה/קוד קופון — אין לך כלי לזה ואסור לך לתת/להמציא קוד בשום מקרה, גם כשנשאלת במפורש. הדרך היחידה להנחה היא הרשמה לניוזלטר (טופס בתחתית כל עמוד באתר) — קוד אישי חד-פעמי נשלח אוטומטית במייל אחרי הרשמה אמיתית. כשעולה נושא הנחה/מחיר יותר זול — הציעי בחום להירשם לניוזלטר, בלי לציין שום קוד קונקרטי בעצמך.
- כששואלים על מחיר — חשבי את המחיר המדויק עם quote_studio_price ואל תעריכי בעצמך.
- אם הלקוחה אומרת שנתקעה, שהטופס לא עובד או שהיא רוצה שתעשי זאת בשבילה — אל תחזירי אותה מיד לאותו טופס. בדקי מה חסר, עזרי בצ׳אט שלב-שלב, וללקוחה עם חשבון אמיתי הציעי ליצור את השריון כאן בהתאם לכללי create_studio_booking.
- יצירת שריון בפועל בשם הלקוחה — רק עם create_studio_booking, ורק אחרי שמתקיימים כל התנאים בתיאור הכלי (זמינות אמיתית, פרטי קשר, אישור מפורש על תנאים ומקדמה). לעולם אל תגידי ללקוחה "שריינתי לך" בלי לקרוא לכלי הזה בפועל.`;
}


// Web-chat only additions (buttons, cards, personal area) — 2026-10-27.
const WEB_CHAT_RULES = `

ממשק האתר (צ׳אט):
- אביזרים שמצאת ב-search_catalog / check_prop_availability מוצגים ללקוחה אוטומטית ככרטיסים עם תמונה, מחיר וכפתור "הוספה לעגלה" — אל תכתבי קישורי תמונה בעצמך, ואל תחזרי על כל הפרטים בטקסט; משפט קצר מספיק.
- כשיש צעד הבא ברור (להזמין, לשריין, לעבור לעגלה, להתחבר, לאזור האישי) — קראי ל-show_buttons עם עד 3 כפתורים.
- "האזור האישי / ההזמנות שלי / כמה קרדיט יש לי" — get_my_account. לא מחוברת → כפתור התחברות (/auth).
- הזמנת אביזרים: מוסיפים לעגלה מהכרטיסים ואז כפתור /cart לסיום. שריון סטודיו: כמו קודם (create_studio_booking או כפתור /booking).
- "תשלחי הודעה למיכל/לסטודיו" — נסחי איתה את ההודעה, קבלי שם + טלפון/אימייל, ואז send_message_to_studio.`;

type ChatUi = {
  products: Array<{ sku: string; name: string; price: number; img: string | null; available?: boolean }>;
  buttons: Array<{ label: string; href: string }>;
  actions: Array<{ kind: "order_status" | "booking_status" | "lead_status"; id: string; status: string; summary: string }>;
};

const CATALOG_IMG = new Map<string, string>(
  (catalogData as Array<{ items: Array<{ sku: string; img?: string }> }>).flatMap((c) =>
    c.items.filter((i) => i.img).map((i) => [i.sku, i.img as string] as [string, string]),
  ),
);

/** Turns the tool calls/results of one turn into UI blocks for the chat widget. */
export async function buildChatUi(steps: any[]): Promise<ChatUi> {
  const ui: ChatUi = { products: [], buttons: [], actions: [] };
  const seen = new Set<string>();
  for (const st of steps) {
    for (const call of st.toolCalls ?? []) {
      const input = call.input ?? call.args ?? {};
      if (call.toolName === "show_buttons") {
        for (const b of input.buttons ?? []) {
          const path = String(b.href ?? "").split(/[?#]/)[0];
          if ((CHAT_BUTTON_PATHS as readonly string[]).includes(path) && ui.buttons.length < 3)
            ui.buttons.push({ label: String(b.label).slice(0, 30), href: String(b.href) });
        }
      } else if (call.toolName === "propose_admin_action" && ui.actions.length < 3) {
        ui.actions.push({ kind: input.kind, id: input.id, status: input.status, summary: String(input.summary ?? "") });
      }
    }
    for (const r of st.toolResults ?? []) {
      if (r.toolName !== "search_catalog" && r.toolName !== "check_prop_availability") continue;
      const out = r.output ?? r.result ?? {};
      for (const it of out.items ?? []) {
        if (!it?.sku || seen.has(it.sku) || ui.products.length >= 6) continue;
        seen.add(it.sku);
        const cat = (catalogData as Array<{ items: Array<{ sku: string; name?: string; alt?: string; price: number }> }>)
          .flatMap((c) => c.items)
          .find((x) => x.sku === it.sku);
        ui.products.push({
          sku: it.sku,
          name: it.name || cat?.name || cat?.alt || it.sku,
          price: Number(it.price ?? cat?.price ?? 0),
          img: CATALOG_IMG.get(it.sku) ?? null,
          ...(typeof it.available === "boolean" ? { available: it.available } : {}),
        });
      }
    }
  }
  // Admin-uploaded images in the items table override the bundled catalog image.
  if (ui.products.length) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("items")
        .select("sku, image_url, price, active")
        .in("sku", ui.products.map((p) => p.sku));
      for (const row of data ?? []) {
        const p = ui.products.find((x) => x.sku === row.sku);
        if (!p) continue;
        if (row.image_url) p.img = row.image_url;
        if (row.price != null) p.price = Number(row.price);
      }
      ui.products = ui.products.filter((p) => !(data ?? []).some((r: any) => r.sku === p.sku && r.active === false));
    } catch {
      // keep catalog images
    }
  }
  return ui;
}

const ChatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(6000),
      }),
    )
    .min(1)
    .max(20),
  userName: z.string().max(80).optional(),
  isAuthenticated: z.boolean().optional(),
  // Client-generated (crypto.randomUUID, kept in sessionStorage) so the
  // whole conversation logs as one growing row instead of one per message —
  // see customer_chat_logs / listChatLogs.
  sessionId: z.string().max(80).optional(),
});

export const chatWithBot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ChatInput.parse(data))
  .handler(async ({ data }) => {
    // The client's `isAuthenticated` flag is only used for tone/wording —
    // it's untrusted. Whether create_studio_booking is actually allowed to
    // run is decided below from the real, server-verified token.
    const { userId: realUserId, isRealAccount } = await getRealAuthState();
    const personalized = data.isAuthenticated
      ? `\n\nהמשתמשת מחוברת לחשבון${data.userName ? ` בשם ${data.userName}` : ""}. את יכולה לפנות אליה בשמה.`
      : `\n\nהמשתמשת לא מחוברת. לביצוע הזמנה בפועל הציעי לה להתחבר בעמוד /auth — אבל בדיקת זמינות אפשר לעשות גם בלי התחברות.`;
    const { israelNow } = await import("./availability.server");
    const now = israelNow();
    const { getBotKnowledgeText } = await import("./bot-knowledge.functions");
    const extraKnowledge = await getBotKnowledgeText();

    const toolRules = buildToolRules(now);

    // Admin mode (2026-10-27): decided from the real token + user_roles,
    // never from anything the client sends.
    let isAdmin = false;
    if (realUserId && isRealAccount) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", realUserId);
        isAdmin = !!roles?.some((r: any) => r.role === "admin");
      } catch (e) {
        console.error("[SWEETBABY] chat admin check failed", e);
      }
    }
    const adminPart = isAdmin ? (await import("./ai-admin-tools.server")).ADMIN_CHAT_RULES : "";
    const adminTools = isAdmin ? (await import("./ai-admin-tools.server")).buildAdminChatTools() : {};

    const result = await generateTextResilient({
      system: SYSTEM + personalized + toolRules + WEB_CHAT_RULES + adminPart + extraKnowledge,
      messages: data.messages,
      tools: {
        ...buildAssistantTools({ isAuthenticated: isRealAccount }),
        ...buildWebChatTools({ userId: realUserId, isRealAccount }),
        ...adminTools,
      },
      stopWhen: stepCountIs(isAdmin ? 10 : 8),
    });
    const text = result.text;
    const toolCalls = (result.steps ?? []).flatMap((st: any) => st.toolCalls ?? []);
    const ui = await buildChatUi(result.steps ?? []);

    // Log the whole conversation so far (every visit, not just ones that
    // book something) — one upserted row per browser session, not one
    // insert per message.
    if (data.sessionId && !isAdmin) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("customer_chat_logs").upsert(
          {
            session_id: data.sessionId,
            user_id: realUserId,
            messages: [...data.messages, { role: "assistant", content: text }],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "session_id" },
        );
      } catch (e) {
        console.error("[SWEETBABY] chat log upsert failed", e);
      }

      // Per explicit request: flag any conversation that went beyond a
      // generic FAQ-style question — a real tool call (checking a specific
      // date's availability, pricing, catalog search, actually booking,
      // etc.) is a cheap, reliable proxy for "this wasn't just small talk",
      // with no extra AI call needed to judge "importance" separately. One
      // notification per session (deduped below), not one per turn — a long
      // back-and-forth would otherwise flood the admin inbox.
      if (toolCalls && toolCalls.length > 0) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: already } = await supabaseAdmin
            .from("admin_notifications")
            .select("id")
            .eq("type", "site_chat_important")
            .contains("body", { session_id: data.sessionId })
            .limit(1);
          if (!already || already.length === 0) {
            const lastUserMsg = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
            await supabaseAdmin.from("admin_notifications").insert({
              type: "site_chat_important",
              title: `שיחת צ'אט עם כוונה ממשית${data.userName ? ` · ${data.userName}` : ""}`,
              body: {
                session_id: data.sessionId,
                snippet: String(lastUserMsg).slice(0, 200),
                tools: [...new Set(toolCalls.map((t: any) => t.toolName))].join(", "),
                user_id: realUserId,
              },
            });
          }
        } catch (e) {
          console.error("[SWEETBABY] important chat notify failed", e);
        }
      }
    }

    return { reply: text, ui, isAdmin };
  });

const SearchInput = z.object({ query: z.string().min(1).max(200) });

export const smartSearchItems = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchInput.parse(data))
  .handler(async ({ data }) => {
    type Cat = {
      title: string;
      items: { sku: string; name: string; alt: string; price: number }[];
    };
    const cats = catalogData as Cat[];

    // The full catalog is ~9,400 characters (394 items) — sending it on
    // EVERY search was the single biggest token cost in this app, bigger
    // than the equipment guide (see ai-bot-efficiency skill). Most queries
    // share at least one real word with an item name or its category title
    // ("עגלת תינוק", "רקע כחול"), so pre-filter locally by keyword first and
    // only ask the model to pick the best subset of a much smaller
    // candidate list. Only fall back to the full catalog when keyword
    // matching finds nothing at all — a genuinely abstract query ("משהו
    // לגיל שנה") still needs the model to see everything to have a chance.
    const tokens = data.query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 2);
    const matchesAnyToken = (s: string) => {
      const low = s.toLowerCase();
      return tokens.some((t) => low.includes(t));
    };
    let candidateCats: Cat[] = tokens.length
      ? cats
          .map((c) =>
            matchesAnyToken(c.title)
              ? c // whole category matched (e.g. query "רקעים" hits a category titled "רקעים")
              : {
                  title: c.title,
                  items: c.items.filter(
                    (i) => matchesAnyToken(i.sku) || matchesAnyToken(i.name || i.alt),
                  ),
                },
          )
          .filter((c) => c.items.length > 0)
      : [];
    const candidateCount = candidateCats.reduce((n, c) => n + c.items.length, 0);
    // Too few (0) means keyword matching found nothing — fall back to the
    // full catalog so a fuzzy/conceptual query still works. Too many (still
    // most of the catalog) means the keyword was too generic to narrow
    // anything down — also just use the full catalog rather than pretend a
    // "filtered" list of 350 items saved anything.
    if (candidateCount === 0 || candidateCount > 150) candidateCats = cats;

    const summary = candidateCats
      .map((c) => `[${c.title}] ` + c.items.map((i) => `#${i.sku}:${i.name || i.alt}`).join(", "))
      .join("\n");

    const { text } = await generateTextResilient({
      system: `את מסייעת לחפש אביזרים בקטלוג צילום. תקבלי שאילתה בעברית ורשימת פריטים. החזירי JSON בלבד בפורמט {"skus":["100","101",...]} עם עד 30 מק"טים הכי רלוונטיים. ללא הסבר, ללא markdown.`,
      prompt: `שאילתה: ${data.query}\n\nקטלוג:\n${summary}`,
    });
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as { skus?: string[] };
      return { skus: parsed.skus ?? [] };
    } catch {
      return { skus: [] };
    }
  });
