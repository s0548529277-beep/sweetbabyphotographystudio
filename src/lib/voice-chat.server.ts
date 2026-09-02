import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { generateTextResilient } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
import { SYSTEM } from "./ai.functions";
import { createPhoneBooking } from "./voice-booking.server";
import { sendMessageToStudio, PROPS_REQUEST_CONTEXT_MARKER } from "./voice-message.server";
import { isAdminVoiceCaller, verifyAdminPin, getAdminVoiceSnapshot } from "./voice-admin.server";
import { lookupCallerProfile, getCallerAccountSummary } from "./voice-caller.server";

export type VoiceMessage = { role: "user" | "assistant"; content: string };

// The bot's own grammatical gender when speaking about itself in first
// person — Hebrew verbs/adjectives referring to the speaker inflect by
// gender ("בודקת"/"בודק", "מצטערת"/"מצטער"). This block itself is written
// with a female baseline (matches the dominant existing wording below and
// the studio's own voice), so the "female" case is a no-op prefix and the
// "male" case is the one doing real work — a clear, prominent rule placed
// FIRST, ahead of every phrasing example below, is deliberately used
// instead of hand-maintaining two full parallel copies of this whole large
// block: it's what actually fixed the original bug (this prompt used to
// mix "אתה"/"תהיה" (male) with "תגידי"/"תשאלי" (female) in the very same
// paragraph — the model just followed whichever form was nearest, which is
// why the bot's own wording sounded inconsistently male/female). See
// BOT_VOICE_GENDER_KEY's doc comment in voice-phrases.server.ts for the
// other half of that bug report (the actual acoustic TTS voice sound,
// which is Yemot's own setting, not something this rule touches).
function voiceGenderRule(gender: "male" | "female"): string {
  return gender === "male"
    ? `\n\nהנחיה קבועה וחשובה על מגדר דקדוקי: אתה מתאר את עצמך תמיד בלשון זכר, בגוף ראשון — "אני בודק", "אני מצטער", "שמרתי לך", "אני אשלח" וכיו"ב. זו הנחיה שגוברת על כל דוגמת ניסוח בלשון נקבה שמופיעה בהמשך ההנחיות (הדוגמאות שם הן על טון ותוכן, לא כלל דקדוקי) — לעולם אל תתאר את עצמך בלשון נקבה.`
    : `\n\nהנחיה קבועה וחשובה על מגדר דקדוקי: את מתארת את עצמך תמיד בלשון נקבה, בגוף ראשון — "אני בודקת", "אני מצטערת", "שמרתי לך", "אני אשלח" וכיו"ב — בדיוק כמו רוב דוגמאות הניסוח בהמשך ההנחיות.`;
}

const VOICE_STYLE_BODY = `\n\nאת עונה כרגע בשיחת טלפון קולית — הלקוחה שומעת אותך, לא קוראת. חשוב מאוד:
- תהיי חמה, נעימה, אישית וסבלנית — בדיוק כמו הטון שלך בצ'אט באתר (הבועה בפינת המסך), לא רק תכליתי ויבשה. חיוך בקול, עניין אמיתי בלקוחה, לא רובוט שממלא טופס. הקיצור והדיוק חשובים (זו שיחת טלפון), אבל חמימות לא פחות חשובה.
- דבר במשפטים קצרים וטבעיים לדיבור, בלי רשימות, בלי כוכביות, בלי אימוג׳ים, בלי קישורים (היא לא יכולה ללחוץ על שום דבר). הלקוחה מתקשרת כי אין לה גישה נוחה לאינטרנט — אל תגיד "לחצי" / "עברי לעמוד" / "ראי באתר".
- אסור בהחלט לפתוח משפט ב"אז את אומרת ש..." / "אז את רוצה ש..." / "הבנתי, את..." / "אוקיי, אז..." — זה הרגל קבוע שגורם לך להישמע רובוטי, וזה בדיוק מה שהתבקשת להפסיק לעשות. דוגמה למה שלא לומר: לקוחה אומרת "אני רוצה לבדוק אם פנוי ביום שלישי בשעה עשר" ואתה עונה "אז את רוצה לבדוק זמינות ביום שלישי בעשר, רגע אני בודקת" — זה חזרה מיותרת. במקום זה תגיד רק "רגע, בודק" או "בודק זמינות" ותקרא לכלי מיד. ככלל: הבקשה ברורה (תאריך+שעה מדויקים, שאלה ברורה) → בלי לחזור על שום פרט, רק משפט קצרצר של "מה אני עושה עכשיו" (בודק / משריין / בודק מחיר) ואז קריאה לכלי — זה מה שממלא את שניות השקט, לא חזרה על הבקשה. רק כשמשהו באמת חסר/לא ברור, או ממש לפני יצירת שריון בפועל, מותר לחזור בקצרה על הפרטים לאישור.
- אם הלקוחה רוצה לשריין תור בפועל: אספי את הפרטים בסדר הבא, שאלה-שאלה (לא הכל בבת אחת) — 1) תאריך ושעה (ולוודא זמינות). 2) סוג הצילום — הציעי בקצרה את הסוגים הנפוצים: חלאקה, ניו-בורן, סמאש קייק, או "אחר" (ואם "אחר" — תשאלי בקצרה מה). אם זה ניו-בורן בוקר, ודאי גם משך. 3) שם מלא. 4) אימייל (ראי כלל הג'ימייל למטה) — איתו אפשר לשלוח לה מיד קישור לתשלום מקדמה מאובטח והשריון ננעל ברגע שהיא משלמת; בלי אימייל השריון עדיין נשמר, אבל הסטודיו יצטרך לחזור אליה טלפונית לתיאום. אם היא רוצה גם להשכיר אביזרים לצילום, אפשר לרשום את זה בקצרה כטקסט חופשי (propsRequest) — לא צריך לבדוק זמינות מדויקת של כל פריט בטלפון, הסטודיו יטפל בזה.
- כשמבקשים את האימייל: רוב הלקוחות עם ג'ימייל, אז תקצרי את זה במקום לבקש לאיית כתובת שלמה (זה גם איטי וגם נוטה להישמע/להיקלט לא נכון בטלפון, בעיקר הסימן @ והמילה "נקודה"). תגידי בקצרה משהו כמו "מה הכתובת שלך בג'ימייל? אני אשלים לבד את החלק של @gmail.com — ואם זה אימייל אחר, פשוט תגידי לי את הכתובת המלאה". אם היא אומרת רק את החלק שלפני ה-@ (בלי לציין דומיין אחר), את משלימה בעצמך ל-@gmail.com; אם היא אומרת דומיין אחר במפורש (וואלה, אאוטלוק וכו') — משתמשים במה שהיא אמרה בפועל, לא מנחשות.
- אל תחכי שהלקוחה תגיד במפורש "אני רוצה לשריין" — ברגע שבדקת זמינות והיא פנויה, וניכר שהלקוחה מתעניינת ברצינות (שאלה על מחיר אחרי שהתאריך פנוי, "מעולה" / "אז זה טוב לי" / המשיכה לשאול פרטים על אותו תאריך) — הציעי בעצמך לשריין, אל תחזרי רק למידע. דוגמה: אחרי "כן, שלישי בעשר פנוי" והלקוחה עונה "מושלם" — אל תעני רק "מעולה, יש עוד משהו?"; תגידי "מעולה! רוצה שאשריין לך את זה עכשיו? אני צריכה רק שם מלא ואימייל". סגירת שריון בפועל, לא רק מסירת מידע, היא המטרה של השיחה. **אם המשפט הראשון שהלקוחה אומרת בשיחה כבר כולל תאריך כלשהו — תאריך מדויק, "מחר", יום בשבוע ("יום שלישי", "ביום שני הקרוב"), או אפילו תאריך עברי (ראי כלל hebrew_date_to_gregorian למטה) — עם או בלי שעה מדויקת, או מזכיר "הזמנת סטודיו"/"שריון סטודיו" — זו כבר כוונה ברורה, בלי שום איתות נוסף נדרש**: בדקי זמינות מיד, ומיד אחרי זה תציעי בעצמך במפורש לבצע את השריון בפועל (לא רק לדווח שהתאריך פנוי ולחכות).
- תקנון/תנאים (מקדמה, ביטולים וכו'): אל תקריא את התקנון המלא בקול כברירת מחדל — זה שיחה, לא הקראה. תגיד בקצרה שהתקנון המלא (מקדמה, ביטולים, כללי הסטודיו) יישלח לה במייל יחד עם פרטי השריון, ותבקש רק אישור בעל-פה שהיא מסכימה לתנאים הבסיסיים (מקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע עצמו = 100%). רק אם היא מבקשת "תקריא לי את זה" — אז תקריא בקול את התנאים המלאים מהמידע החשוב למעלה.
- לפני קריאה לכלי create_phone_booking: חזור ואשר בקול את כל הפרטים (כולל אישור התנאים הבסיסיים כאמור למעלה). ברגע שהכלי מחזיר הצלחה — המשפט הראשון בתשובה שלך חייב להיות הודעה מפורשת וברורה שביצעת שריון בפועל, כולל התאריך והשעות המדויקים, למשל "ביצעתי לך שריון להיום בין שתים עשרה וחצי לאחת וחצי" (בניסוח טבעי משלך, לא מילה במילה) — לא לפתוח בניסוח מעורפל כמו "מעולה, שמרתי" בלי לומר בפירוש שהשריון בוצע ומה בדיוק שוריין. רק אחרי המשפט הזה תמשיכי להסביר בבירור שזו "בקשה ששמורה זמנית", ושאם נשלח לה קישור תשלום היא צריכה לשלם בו כדי לאשר סופית, ואם לא — שהסטודיו יחזור אליה בהקדם טלפונית לתיאום תשלום המקדמה וסגירה סופית. אף פעם אל תגיד "שריינתי לך" בלי לקרוא לכלי בפועל. **ולהפך: לאחר שכבר קראת לכלי הזה בהצלחה באותה שיחה, אף פעם אל תקראי לו שוב לאותו תאריך/שעה** — גם אם הלקוחה אומרת אחר כך "תסגור/י את ההזמנה" / "תאשרי סופית" / כל ניסוח דומה. זה לא אומר "תיצרי שריון חדש", זה אומר שהיא רוצה לוודא שזה סגור — פשוט הזכירי לה שההזמנה כבר שמורה ושהיא נסגרת סופית ברגע שהמקדמה תשולם (בקישור שנשלח או בהעברה הבנקאית).
- תמיד תסיימי את משפט הסיכום של השריון במשפט הזה (בניסוח טבעי משלך, לא מילה במילה): אם היא לא תקבל אישור סופי — בטלפון או במייל — על סגירת ההזמנה תוך 12 שעות, שתתקשר לוודא ישירות מול צוות הסטודיו.
- מיד אחרי שהשריון נוצר, הציעי בעצמך סגירה מיידית (לא רק "בקשה שמורה"): "אם תרצי, אפשר לסגור את זה ממש עכשיו — מעבירים את המקדמה 90₪ בהעברה בנקאית ואני נועלת לך את התאריך". אם היא מתחייבת לבצע את ההעברה — תני לה בקול את הפרטים (אותם פרטים כמו באתר): בנק הפועלים (בנק 12), סניף 533, חשבון 648912, על שם מיכל סיבוני. תסבירי בפשטות שברגע שההעברה מגיעה ומאומתת אצל הסטודיו, השריון ננעל סופית והקוד נשלח — זו לא סתם המתנה כמו שריון רגיל בלי מקדמה, זו סגירה אמיתית ברגע שההעברה מתקבלת. אם היא מעדיפה לשלם באשראי — תזכירי לה שקישור תשלום מאובטח נמצא כבר במייל שנשלח אליה.
- אם הלקוחה מבקשת לדבר עם בן אדם, מתעקשת, כועסת, או שאתה לא מצליח לעזור — קרא לכלי transfer_to_human ואמור בקול שאתה מעביר אותה עכשיו.
- כל פעם שאתה עומד להגיד ללקוחה "הסטודיו יחזור אליך" — בגלל תקלה, כלי שנכשל, שריון בלי אימייל, או כל סיבה אחרת — אל תסתפק בהבטחה סתמית. תציע לה במפורש להשאיר הודעה קצרה עכשיו (מה היא רוצה, מתי, כל פרט רלוונטי) ותקרא לכלי leave_message_for_studio כדי שההודעה באמת תישלח לסטודיו במייל, כולל המספר שלה. זה משנה את ה"יחזרו אליך" מהבטחה ריקה למשהו אמיתי שהצוות רואה.
- אם הלקוחה רוצה **רק** להשכיר אביזרים/ציוד (בלי שריון סטודיו בכלל): קודם כל תגידי לה בקצרה שההזמנה הכי מהירה ונוחה לאביזרים היא דרך האתר (יש שם קטלוג מלא עם זמינות בזמן אמת ותשלום מיידי) — ורק אם היא לא נוחה עם זה או ממשיכה בטלפון, תמשיכי בתהליך הבא. לעולם אל תעבירי בקשת אביזרים הלאה לפי תיאור כללי בלבד ("משהו לניו-בורן" וכו') — קראי ל-search_catalog ו/או check_prop_availability כדי לזהות בוודאות את הפריט/ים המדויקים (שם מדויק ומק"ט אם קיים) שהיא מתכוונת אליהם ולוודא שהם קיימים וזמינים בתאריכים שלה, ותני לה מושג כללי על המחיר מהפריטים שמצאת. בניגוד לשריון סטודיו — כאן **אין** שריון אוטומטי בטלפון בשום מקרה: קראי לכלי request_props_rental עם הפריטים המזוהים (שם/מק"ט/כמות) ותאריכי איסוף/החזרה אם נמסרו, וזה ישלח את הבקשה לסטודיו. תסבירי לה בקול בבירור שההזמנה בפועל תסגר ע"י הסטודיו עצמו לאחר בדיקה סופית של המלאי, לא כרגע — והם יחזרו אליה בהקדם עם פרטי תשלום מדויקים.
- אם השיחה מגיעה לסיומה הטבעי (הלקוחה נפרדת/מודה/אין עוד שאלות) — אחרי המשפט האחרון שלך קרא לכלי end_call.
- **כלל כללי לכל תשובה ארוכה בשיחה קולית (חריגה למידע החשוב למעלה, שנועד לצ'אט הכתוב):** אף פעם אל תקריאי בקול תשובה ארוכה במלואה בבת אחת — משפט ארוך נשמע כמו נאום בטלפון, לא כמו שיחה, וגם לוקח לבינה זמן ארוך לייצר ולהקריא (שקט מורגש בטלפון). זה חל על כל תשובה ארוכה, לא רק הדרכת הציוד — למשל כל ההדרכה המלאה, רשימת פריטים ארוכה, הסבר מרובה-שלבים וכו'. הכלל: תני רק את החלק הראשון/החשוב ביותר בכמה משפטים קצרים, ואז שאלי בקצרה "רוצה שאמשיך?" / "יש עוד פרט שמעניין אותך?" — תמשיכי לפרטים נוספים רק אם היא מבקשת. זו התאמה לקצב שיחה טבעי, לא ויתור על מידע — היא תמיד יכולה לקבל את הכל, פשוט בחלקים קצרים במקום נאום ארוך.
- אם הכלים admin_business_snapshot/admin_open_door_now/admin_search_email/admin_read_email_body/admin_send_email מופיעים אצלך (זה קורה רק כשהמתקשרת היא בעלת הסטודיו, לפי המספר שממנו היא מתקשרת) — זו כנראה היא, לא לקוחה רגילה. אם היא מבקשת מידע עסקי, לפתוח את הדלת, לחפש/לשמוע מייל, או לשלוח מייל — בקשי ממנה בקצרה קוד PIN לפני שאת קוראת לכלי המתאים (אף פעם לא בלי PIN), והשתמשי בדיוק במה שהכלי מחזיר. אם היא מבקשת לשמוע מייל ספציפי מתוך רשימת תוצאות חיפוש — קראי ל-admin_read_email_body עם ה-id המתאים. לפני שליחת מייל בפועל (admin_send_email) — חזרי בקול על הנמען, הנושא ותמצית התוכן לאישור. אל תציעי את היכולות האלה ללקוחה רגילה ואל תזכירי בכלל שהן קיימות אם הכלים לא מופיעים אצלך.`;

function buildVoiceStyle(gender: "male" | "female"): string {
  return voiceGenderRule(gender) + VOICE_STYLE_BODY;
}

function buildVoiceTools(callerPhone: string) {
  // create_studio_booking is unusable on a phone call by construction — it
  // requires a real logged-in account (isAuthenticated), which a phone
  // caller never has, so its description literally instructs the model
  // never to call it here. Voice has its own equivalent, create_phone_booking
  // below. Dropping it saves its ~1,450-character description on every
  // single voice turn for a tool that could never fire anyway.
  const { create_studio_booking: _unused, ...base } = buildAssistantTools({ isAuthenticated: false });
  return {
    ...base,
    create_phone_booking: tool({
      description:
        'יוצרת בקשת שריון סטודיו אמיתית (במצב ממתין) מתוך פרטים שנאספו בשיחה הטלפונית. יש לוודא זמינות עם check_studio_availability ולקרוא בקול את הפרטים לאישור הלקוחה *לפני* קריאה לכלי הזה. אם יש לך אימייל שלה — תמיד תעביר אותו (contactEmail), כדי שנוכל לשלוח לה מיד קישור תשלום מקדמה אמיתי. חשוב: אם כבר קראת לכלי הזה קודם באותה שיחה לאותו תאריך/שעה (את כבר אמרת ללקוחה "שמרתי"/"שריינתי") — אל תקראי לו שוב, גם אם היא אומרת "תסגור/י את זה" או "תאשרי" — זה כבר נעשה, פשוט הזכירי לה שההזמנה שמורה ושצריך רק לשלם את המקדמה כדי לסגור סופית.',
      inputSchema: z.object({
        date: z.string().describe("YYYY-MM-DD"),
        startTime: z.string().describe("HH:MM"),
        hours: z.number().describe("משך בשעות, אפשר 1.5"),
        contactName: z.string(),
        contactEmail: z.string().email().optional().describe("אימייל הלקוחה, אם נמסר — כדי לשלוח קישור תשלום מקדמה מאובטח"),
        sessionType: z.string().optional().describe("סוג הצילום, למשל משפחתי / ניו-בורן / חלאקה"),
        propsRequest: z.string().optional().describe("תיאור חופשי קצר של אביזרים שהלקוחה ביקשה להשכיר יחד עם השריון, אם ביקשה"),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        try {
          const slots = Math.max(2, Math.round(args.hours * 2));
          const res = await createPhoneBooking({
            session_date: args.date,
            start_time: args.startTime.slice(0, 5),
            slots,
            contact_name: args.contactName,
            contact_phone: callerPhone,
            contact_email: args.contactEmail,
            session_type: args.sessionType,
            props_request: args.propsRequest,
            notes: args.notes,
          });
          const newAccountPin = (res as { newAccountPin?: string | null }).newAccountPin ?? null;
          const accountNote = newAccountPin
            ? ` נפתח לה גם אזור אישי חדש באתר — לקראת סוף השיחה (לא באמצע, אחרי שכל שאר הפרטים סגורים) תגידי לה בבירור שאפשר להיכנס לאזור האישי עם האימייל שלה והקוד ${newAccountPin} (תקריאי את הספרות אחת-אחת), ושם לראות/לעדכן את כל פרטי ההזמנה.`
            : "";
          return {
            ok: true,
            bookingId: res.id,
            price: res.price,
            deposit: res.deposit,
            emailSent: res.emailSent,
            message:
              ((res as { alreadyExisted?: boolean }).alreadyExisted
                ? "השריון הזה כבר נוצר קודם באותה שיחה — אין צורך ליצור אותו שוב. תסבירי בקצרה ללקוחה שההזמנה כבר שמורה, ושכדי לסגור סופית צריך רק לשלם את המקדמה (בקישור שכבר נשלח למייל, אם היה מייל, אחרת בהעברה הבנקאית שהוצעה)."
                : res.emailSent
                  ? "הבקשה נשמרה במצב ממתין ונשלח מייל עם קישור תשלום מקדמה מאובטח. הסבר ללקוחה שהתאריך שמור לה זמנית, ושברגע שהיא תשלם דרך הקישור במייל השריון יתאשר סופית."
                  : "הבקשה נשמרה במצב ממתין. הסבר ללקוחה שהתאריך שמור לה זמנית, ושתקבל שיחה חוזרת מהסטודיו לתיאום סופי ותשלום המקדמה.") + accountNote,
          };
        } catch (e: any) {
          return {
            ok: false,
            message: `יצירת השריון נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. הצע ללקוחה שעה אחרת אם רלוונטי, ואם היא עדיין רוצה שהסטודיו יחזור אליה — קרא לכלי leave_message_for_studio כדי שזה באמת יגיע אליהם, לא רק הבטחה.`,
          };
        }
      },
    }),
    leave_message_for_studio: tool({
      description:
        'שולחת הודעה חופשית מהלקוחה ישירות לצוות הסטודיו במייל, כולל מספר הטלפון שממנו היא מתקשרת. תשתמש בזה בכל פעם שאתה אומר ללקוחה "הסטודיו יחזור אליך" — במקום הבטחה סתמית, זה הופך את זה למשהו אמיתי שנשלח בפועל.',
      inputSchema: z.object({
        message: z.string().min(1).describe("תוכן ההודעה מהלקוחה — מה היא רוצה, מתי, כל פרט רלוונטי"),
        contactName: z.string().optional(),
        context: z.string().optional().describe("למה זה נשלח, למשל 'תקלה בבדיקת זמינות' / 'ביקשה לדבר עם נציגה'"),
      }),
      execute: async ({ message, contactName, context }) => {
        const res = await sendMessageToStudio({ message, callerPhone, contactName, context });
        return {
          ok: res.ok,
          message: res.ok
            ? "ההודעה נשלחה לסטודיו. אשר ללקוחה בקול שההודעה נשלחה ושיחזרו אליה."
            : "השליחה לא הצליחה באופן ודאי — עדיין תגיד ללקוחה שקיבלת את ההודעה ושיחזרו אליה, ותמליץ גם על יצירת קשר ישיר: 054-8529277.",
        };
      },
    }),
    // Deliberately separate from create_phone_booking: a props-only phone
    // request never creates a real order or locks inventory (unlike a studio
    // booking) — actual reservation is done manually by a staff member after
    // reviewing it, since exact SKU/quantity selection against real stock is
    // too risky to trust to spoken language alone. This tool exists (instead
    // of just reusing leave_message_for_studio with a free-text context) so
    // the admin-notification `context` field is a fixed, code-baked marker
    // (PROPS_REQUEST_CONTEXT_MARKER) rather than something the model types
    // fresh each time — that's what lets notifyPendingPropsRequests later
    // find these reliably for the reminder-call escalation.
    request_props_rental: tool({
      description:
        'שולחת לסטודיו בקשה להשכרת אביזרים/ציוד בלבד (בלי שריון סטודיו) לביצוע שריון בפועל ע"י מנהל. יש לזהות קודם את הפריטים המדויקים (שם + מק"ט אם קיים) עם search_catalog/check_prop_availability — לא לפי תיאור כללי. הכלי הזה לא יוצר הזמנה אמיתית או נועל מלאי, רק מעביר בקשה לטיפול ידני.',
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              name: z.string().describe('שם הפריט המדויק כפי שהתקבל מתוצאות search_catalog/check_prop_availability'),
              sku: z.string().optional().describe('מק"ט הפריט, אם עלה בתוצאות הכלים'),
              quantity: z.number().int().min(1).default(1),
            }),
          )
          .min(1),
        pickupDate: z.string().optional().describe("YYYY-MM-DD, תאריך איסוף אם נמסר"),
        returnDate: z.string().optional().describe("YYYY-MM-DD, תאריך החזרה אם נמסר"),
        contactName: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ items, pickupDate, returnDate, contactName, notes }) => {
        const itemsText = items.map((i) => `${i.name}${i.sku ? ` (מק"ט ${i.sku})` : ""} × ${i.quantity}`).join(", ");
        const message = [
          `בקשת השכרת אביזרים טלפונית: ${itemsText}`,
          pickupDate ? `תאריך איסוף: ${pickupDate}` : null,
          returnDate ? `תאריך החזרה: ${returnDate}` : null,
          notes,
        ]
          .filter(Boolean)
          .join("\n");
        const res = await sendMessageToStudio({ message, callerPhone, contactName, context: PROPS_REQUEST_CONTEXT_MARKER });
        return {
          ok: res.ok,
          message: res.ok
            ? 'הבקשה נשלחה לסטודיו. הסבירי ללקוחה שהשריון בפועל יתבצע ע"י הסטודיו לאחר בדיקה סופית של המלאי, ושיחזרו אליה בהקדם עם פרטי תשלום.'
            : "השליחה לא הצליחה באופן ודאי — עדיין תגידי ללקוחה שקיבלת את הבקשה ושיחזרו אליה, ותמליצי גם על יצירת קשר ישיר: 054-8529277.",
        };
      },
    }),
    get_my_account_info: tool({
      description:
        'תמונת מצב מהאזור האישי של המתקשרת עצמה באתר — שריונים קרובים, הזמנות אחרונות, יתרת קרדיט, וכרטיסיות. זמין רק אם המתקשרת מזוהה כבעלת חשבון אמיתי באתר (לפי המספר שממנו היא מתקשרת) — אם היא לא מזוהה, הכלי יגיד זאת ואין צורך לנחש. תמיד יוצג רק המידע של המתקשרת עצמה.',
      inputSchema: z.object({}),
      execute: async () => {
        const profile = await lookupCallerProfile(callerPhone);
        if (!profile) {
          return {
            ok: false,
            message: "המספר הזה לא מזוהה כחשבון קיים באתר. הסבירי בעדינות שאם יש לה חשבון, כדאי לוודא שהטלפון בפרופיל תואם למספר שממנו היא מתקשרת.",
          };
        }
        try {
          const summary = await getCallerAccountSummary(profile.userId);
          return { ok: true, summary };
        } catch (e: any) {
          return { ok: false, message: `שליפת המידע נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. הציעי לה להיכנס לאזור האישי באתר במקום.` };
        }
      },
    }),
    transfer_to_human: tool({
      description: "מעבירה את השיחה לבן אדם אמיתי בסטודיו — להשתמש כשהלקוחה מבקשת זאת במפורש, כועסת, או כשאין לך תשובה טובה.",
      inputSchema: z.object({ reason: z.string().optional() }),
      execute: async ({ reason }) => ({ ok: true, reason: reason ?? null }),
    }),
    end_call: tool({
      description: "מסמנת שהשיחה הגיעה לסיומה הטבעי ואפשר לנתק בנימוס אחרי המשפט האחרון.",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    }),
    // Only added to the tool list at all when the caller's number matches
    // one of the studio's own admin numbers (isAdminVoiceCaller) — a
    // regular customer's tool list never even mentions these exist, which
    // is itself a layer of protection (nothing to probe/discover) and also
    // saves the token cost of these descriptions on every ordinary call.
    // Caller ID alone is NOT trusted for what these actually do — each one
    // independently re-checks the spoken PIN via verifyAdminPin before
    // doing anything real. See voice-admin.server.ts's doc comment for why
    // (spoofable caller ID + a lost/borrowed/stolen phone).
    ...(isAdminVoiceCaller(callerPhone)
      ? {
          admin_business_snapshot: tool({
            description:
              'תמונת מצב עסקית קצרה לבעלת הסטודיו בלבד: הזמנות היום, השריונים הקרובים, הזמנות אביזרים אחרונות, וכמה התראות לא נקראו. יש לוודא PIN תקין *לפני* קריאה לכלי — בקשי ממנה לומר את קוד ה-PIN, והעבירי אותו כפרמטר. אל תשתמשי בכלי הזה למתקשרת רגילה בשום מצב.',
            inputSchema: z.object({ pin: z.string().min(1).describe("קוד ה-PIN שהמתקשרת אמרה בקול") }),
            execute: async ({ pin }) => {
              if (!verifyAdminPin(pin)) {
                return {
                  ok: false,
                  message:
                    "הקוד שגוי. אל תגלי אם הוא היה קרוב או רחוק מהנכון, ואל תמשיכי לנחש — רק תגידי שהקוד לא נכון ותני לה הזדמנות נוספת אחת בלבד; אם היא שוב טועה, הציעי שתבדוק בעצמה בממשק הניהול.",
                };
              }
              try {
                const s = await getAdminVoiceSnapshot();
                return { ok: true, snapshot: s };
              } catch (e: any) {
                return { ok: false, message: `שליפת המידע נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. הציעי שתבדוק בממשק הניהול במקום.` };
              }
            },
          }),
          admin_open_door_now: tool({
            description:
              'פותחת דלת הסטודיו עבור בעלת הסטודיו בלבד — יוצרת קוד כניסה זמני ומחזירה אותו כדי שתקריאי אותו בקול. יש לוודא PIN תקין *לפני* קריאה לכלי, בדיוק כמו ב-admin_business_snapshot. זו פעולה רגישה (פותחת גישה פיזית לסטודיו) — לעולם אל תקראי לכלי הזה בלי PIN מאומת, ואל תמציאי/תנחשי קוד דלת בעצמך. שאלי כמה זמן היא צריכה שהקוד יהיה תקף (למשל "לכמה זמן?") — ברירת מחדל 4 שעות אם לא צוין אחרת, מקסימום 24 שעות. אם היא אומרת שזו כניסה חד-פעמית/מיידית בלבד (נכנסת עכשיו ולא צריכה את הקוד אחר כך) — סמני oneTime, וזה ייתן קוד שתקף רק לרבע שעה קרוב (לא באמת חד-פעמי טכנית — אין עדיין ביטול אוטומטי אחרי שימוש ראשון — אלא חלון קצר מאוד שמשיג בפועל את אותה תוצאה).',
            inputSchema: z.object({
              pin: z.string().min(1).describe("קוד ה-PIN שהמתקשרת אמרה בקול"),
              hours: z.number().min(0.25).max(24).optional().describe("כמה שעות הקוד יהיה תקף — ברירת מחדל 4 אם לא נאמר אחרת"),
              oneTime: z.boolean().optional().describe("כניסה חד-פעמית/מיידית בלבד — יעקוף את hours ויתן חלון קצר של רבע שעה"),
            }),
            execute: async ({ pin, hours, oneTime }) => {
              if (!verifyAdminPin(pin)) {
                return {
                  ok: false,
                  message:
                    "הקוד שגוי. אל תגלי אם הוא היה קרוב או רחוק מהנכון, ואל תפתחי כלום. תני לה הזדמנות נוספת אחת בלבד; אם היא שוב טועה, אל תמשיכי לנסות — הציעי שתפתח באמצעי אחר.",
                };
              }
              // TTLock's own single-use passcode parameter isn't verified
              // against this account/integration yet (see
              // issueAdHocDoorCode's own doc comment) — rather than guess at
              // an unconfirmed API shape for something this sensitive, a
              // short validity window achieves the same practical outcome
              // ("use it now, not still open hours later") on the exact same
              // proven code path already used for real bookings.
              const validForMinutes = oneTime ? 15 : Math.round((hours ?? 4) * 60);
              try {
                const { issueAdHocDoorCode } = await import("@/integrations/ttlock/client.server");
                const result = await issueAdHocDoorCode({ label: "פתיחה מיידית - טלפון", validForMinutes });
                if (!result) {
                  return { ok: false, message: "יצירת הקוד נכשלה מסיבה טכנית. הציעי שתנסה שוב בעוד רגע, או שתשתמש בקוד קיים אם יש." };
                }
                const validityText = oneTime ? "רבע שעה בלבד — תיכנסי איתו עכשיו" : `${hours ?? 4} שעות מעכשיו`;
                return {
                  ok: true,
                  code: result.code,
                  message: `הקריאי בקול בבירור את הקוד: ${result.code}, ואמרי שהוא בתוקף ל${validityText}. תזכירי לה ללחוץ # אחרי הקשת הקוד בלוח.`,
                };
              } catch (e: any) {
                return { ok: false, message: `יצירת הקוד נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. הציעי שתנסה שוב בעוד רגע.` };
              }
            },
          }),
          admin_search_email: tool({
            description:
              'מחפשת בתיבת המייל המחוברת של הסטודיו (Gmail) ומחזירה תקצירים קצרים (נושא/שולח/תאריך/תמצית) — לבעלת הסטודיו בלבד. יש לוודא PIN תקין *לפני* קריאה לכלי, בדיוק כמו ב-admin_business_snapshot. query הוא ביטוי חיפוש בסגנון Gmail (למשל "from:ישראל", "is:unread", מילות מפתח מהנושא/תוכן) — אם היא לא נתנה ביטוי חיפוש מדויק, בני אחד סביר מהמילים שלה. לתוכן המלא של מייל ספציפי מהתוצאות, קראי אחר כך ל-admin_read_email_body עם ה-id שלו.',
            inputSchema: z.object({
              pin: z.string().min(1).describe("קוד ה-PIN שהמתקשרת אמרה בקול"),
              query: z.string().min(1).describe("ביטוי חיפוש בסגנון Gmail"),
            }),
            execute: async ({ pin, query }) => {
              if (!verifyAdminPin(pin)) {
                return {
                  ok: false,
                  message:
                    "הקוד שגוי. אל תגלי אם הוא היה קרוב או רחוק מהנכון, ואל תמשיכי לנחש — רק תגידי שהקוד לא נכון ותני לה הזדמנות נוספת אחת בלבד; אם היא שוב טועה, הציעי שתבדוק בעצמה בממשק הניהול.",
                };
              }
              try {
                const { searchGmail } = await import("@/integrations/google/gmail.server");
                const results = await searchGmail(query, 8);
                return results.length === 0
                  ? { ok: true, results: [], message: "לא נמצאו מיילים תואמים לחיפוש הזה." }
                  : { ok: true, results };
              } catch (e: any) {
                return { ok: false, message: `החיפוש נכשל: ${e?.message ?? "שגיאה לא צפויה"}. הציעי שתבדוק בממשק הניהול במקום.` };
              }
            },
          }),
          admin_read_email_body: tool({
            description:
              'מחזירה את התוכן המלא (טקסט) של מייל אחד ספציפי, לפי id שהתקבל מתוצאות admin_search_email. יש לוודא PIN תקין *לפני* קריאה לכלי, כמו בשאר כלי הניהול — אם כבר אומת PIN קודם באותה שיחה, אפשר להעביר את אותו קוד בלי לבקש אותו שוב מהמתקשרת.',
            inputSchema: z.object({
              pin: z.string().min(1).describe("קוד ה-PIN"),
              id: z.string().min(1).describe("מזהה ההודעה מתוצאות admin_search_email"),
            }),
            execute: async ({ pin, id }) => {
              if (!verifyAdminPin(pin)) {
                return { ok: false, message: "הקוד שגוי. אל תגלי אם הוא היה קרוב או רחוק, ותני הזדמנות נוספת אחת בלבד." };
              }
              try {
                const { getGmailMessageBody } = await import("@/integrations/google/gmail.server");
                const body = await getGmailMessageBody(id);
                if (!body) return { ok: false, message: "לא הצלחתי לשלוף את תוכן המייל הזה." };
                // Trimmed to keep the reply readable out loud — full text is
                // still available in the admin panel if she needs every word.
                return { ok: true, body: body.slice(0, 3000) };
              } catch (e: any) {
                return { ok: false, message: `שליפת התוכן נכשלה: ${e?.message ?? "שגיאה לא צפויה"}` };
              }
            },
          }),
          admin_send_email: tool({
            description:
              'שולחת מייל חדש מכתובת הסטודיו — לבעלת הסטודיו בלבד. יש לוודא PIN תקין *לפני* קריאה לכלי (אם כבר אומת PIN קודם באותה שיחה — אפשר להעביר את אותו קוד בלי לבקש שוב). זו פעולה שיוצאת בפועל ללקוח/גורם חיצוני — חובה לחזור בקול על הנמען, הנושא ותמצית התוכן ולקבל אישור מפורש ("לשלוח?") לפני קריאה לכלי, בדיוק כמו לפני יצירת שריון.',
            inputSchema: z.object({
              pin: z.string().min(1).describe("קוד ה-PIN שהמתקשרת אמרה בקול"),
              to: z.string().email().describe("כתובת הנמען"),
              subject: z.string().min(1),
              body: z.string().min(1).describe("תוכן המייל, טקסט רגיל"),
            }),
            execute: async ({ pin, to, subject, body }) => {
              if (!verifyAdminPin(pin)) {
                return { ok: false, message: "הקוד שגוי. אל תגלי אם הוא היה קרוב או רחוק, ואל תשלחי כלום. תני הזדמנות נוספת אחת בלבד." };
              }
              try {
                const { sendGmail } = await import("@/integrations/google/gmail.server");
                const html = body.replace(/\n/g, "<br>");
                const sent = await sendGmail({ to, subject, html });
                return sent
                  ? { ok: true, message: "המייל נשלח בהצלחה. אשרי בקול שהוא נשלח." }
                  : { ok: false, message: "השליחה נכשלה מסיבה טכנית. הציעי שתנסי שוב בעוד רגע, או תבדקי בממשק הניהול." };
              } catch (e: any) {
                return { ok: false, message: `השליחה נכשלה: ${e?.message ?? "שגיאה לא צפויה"}` };
              }
            },
          }),
        }
      : {}),
  };
}

export type VoiceTurnResult = {
  text: string;
  action: "continue" | "transfer" | "hangup";
};

// Prompt instructions alone didn't reliably stop the model from opening
// with an echo of what the caller just said ("אז את אומרת ש...", "הבנתי,
// את..."), reported repeatedly on live calls even after strengthening
// VOICE_STYLE — so this is a deterministic backstop: strip a small, narrow
// set of known echo-opener patterns from the start of the reply. Narrow on
// purpose (exact phrase shapes, not a broad "starts with את/אתה" regex)
// so it can't eat real content by accident; if it doesn't match, the text
// passes through unchanged.
const ECHO_OPENER_PATTERNS = [
  /^אָ?ז\s+(את|אתה)\s+(אומרת|אומר|רוצה|מבקשת|מבקש|צריכה|צריך|שואלת|שואל)\s+ש[^.!?]*[.!?]\s*/,
  /^(הבנתי|אוקיי|אוקי|בסדר|יופי|מעולה)[,.]?\s+אז\s+(את|אתה)?\s*(אומרת|אומר|רוצה|מבקשת|מבקש)[^.!?]*[.!?]\s*/,
];

function stripEchoOpener(text: string): string {
  for (const re of ECHO_OPENER_PATTERNS) {
    const stripped = text.replace(re, "");
    if (stripped !== text && stripped.trim().length > 0) return stripped.trim();
  }
  return text;
}

// A niqqud (vowel-point) fixup for a handful of domain nouns was tried here
// — a deterministic string-replace on the model's reply, zero AI-token cost
// — but reverted: confirmed live (owner listened to the actual call) that
// the hand-picked niqqud was itself incorrect. Wrong niqqud is worse than
// none (a mis-vocalized word can force a *worse* pronunciation than the
// TTS engine's own default reading), and there's no way to verify correct
// niqqud from this environment without hearing the real TTS output — so
// don't re-add this without a way to confirm the vocalization is actually
// right first. The deeper pronunciation-clarity question turned out to be
// about the TTS engine/voice itself, not spelling — see the admin toggle
// below for the real fix being tried instead.

/** Runs one turn of the phone-call conversation through the same AI brain as the text chat, with a voice-appropriate tool set (read-only site info + phone booking + transfer/end-call signals). */
export async function runVoiceTurn(messages: VoiceMessage[], callerPhone: string): Promise<VoiceTurnResult> {
  const { israelNow } = await import("./availability.server");
  const { lookupCallerProfile } = await import("./voice-caller.server");
  const { getBotKnowledgeText } = await import("./bot-knowledge.functions");
  const { getBotVoiceGender } = await import("./voice-phrases.server");
  const now = israelNow();
  const caller = await lookupCallerProfile(callerPhone);
  const extraKnowledge = await getBotKnowledgeText();
  const botVoiceGender = await getBotVoiceGender();

  const toolRules = `\n\nהיום ${now.date}, השעה בישראל ${now.time}. יש לך גישה אמיתית ליומן הסטודיו ולמלאי האביזרים — בדוק תמיד עם הכלים (check_studio_availability / check_prop_availability / find_next_available_days / quote_studio_price / list_active_coupons / hebrew_date_to_gregorian), בכל פעם מחדש, אף פעם אל תניח או תסתמך על תשובה קודמת באותה שיחה.
כשהלקוחה שואלת משהו שקל יותר לראות בעיניים (תמונות מהסטודיו, קטלוג האביזרים המלא, גלריה) — הצע לה קודם, בקצרה, שאפשר גם לחפש בגוגל "סטודיו סוויט בייבי" ולראות הכול באתר. אם היא אומרת שזה לא נוח לה כרגע (בלי גישה נוחה לאינטרנט, מעדיפה לסגור עכשיו בטלפון וכו׳) — המשך ותעזור לה לשריין ישירות בשיחה, בלי לחזור ולהפנות אותה לאתר.${
    caller?.name
      ? `\n\nזיהינו את המתקשרת: יש לה כבר אזור אישי באתר בשם "${caller.name}"${caller.email ? `, אימייל ${caller.email}` : ""}. פני אליה בשמה (לא "גברת" או "לקוחה יקרה"). ${caller.upcomingText ?? ""} אם משריינים תור: את כבר יודעת את השם והאימייל שלה — אל תשאלי אותם מחדש כאילו זו פעם ראשונה. במקום זה, ממש לפני קריאה ל-create_phone_booking, רק תאשרי בקצרה בעל-פה ("לשלוח את זה ל${caller.email ?? "המייל שיש לנו"}, כרגיל?") — ואם היא אומרת שזה השתנה, תשתמשי בכתובת החדשה שהיא נותנת.`
      : ""
  }`;

  // A tighter 10s/4-step budget was tried here and made things worse in
  // practice — live calls started failing ("אין מענה משרת ה-API") *more*
  // often, not less, because a real check (e.g. availability, which needs a
  // Supabase query + a Google Calendar round trip + the model's own
  // reasoning) sometimes genuinely needs more than 10s, and cutting it off
  // early turned "slow but correct" into an outright failure that then had
  // to fall back to the Lovable gateway. So: back to a generous budget per
  // direct feedback ("תתן לו אפילו חצי דקה") — 30s per attempt, 6 tool-call
  // rounds — closer to the site-chat default than the phone-specific one
  // this used to be.
  const result = await generateTextResilient(
    {
      system: SYSTEM + buildVoiceStyle(botVoiceGender) + toolRules + extraKnowledge,
      messages,
      tools: buildVoiceTools(callerPhone),
      stopWhen: stepCountIs(6),
    },
    30_000,
  );

  let action: VoiceTurnResult["action"] = "continue";
  for (const step of result.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName === "transfer_to_human") action = "transfer";
      else if (call.toolName === "end_call" && action === "continue") action = "hangup";
    }
  }

  return { text: stripEchoOpener(result.text), action };
}
