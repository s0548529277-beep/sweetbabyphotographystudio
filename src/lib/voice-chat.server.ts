import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { generateTextResilient } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
import { SYSTEM } from "./ai.functions";
import { createPhoneBooking } from "./voice-booking.server";
import { sendMessageToStudio } from "./voice-message.server";

export type VoiceMessage = { role: "user" | "assistant"; content: string };

const VOICE_STYLE = `\n\nאתה עונה כרגע בשיחת טלפון קולית — הלקוחה שומעת אותך, לא קוראת. חשוב מאוד:
- תהיה חם, נעים, אישי וסבלני — בדיוק כמו הטון שלך בצ'אט באתר (הבועה בפינת המסך), לא רק תכליתי ויבש. חיוך בקול, עניין אמיתי בלקוחה, לא רובוט שממלא טופס. הקיצור והדיוק חשובים (זו שיחת טלפון), אבל חמימות לא פחות חשובה.
- דבר במשפטים קצרים וטבעיים לדיבור, בלי רשימות, בלי כוכביות, בלי אימוג׳ים, בלי קישורים (היא לא יכולה ללחוץ על שום דבר). הלקוחה מתקשרת כי אין לה גישה נוחה לאינטרנט — אל תגיד "לחצי" / "עברי לעמוד" / "ראי באתר".
- אסור בהחלט לפתוח משפט ב"אז את אומרת ש..." / "אז את רוצה ש..." / "הבנתי, את..." / "אוקיי, אז..." — זה הרגל קבוע שגורם לך להישמע רובוטי, וזה בדיוק מה שהתבקשת להפסיק לעשות. דוגמה למה שלא לומר: לקוחה אומרת "אני רוצה לבדוק אם פנוי ביום שלישי בשעה עשר" ואתה עונה "אז את רוצה לבדוק זמינות ביום שלישי בעשר, רגע אני בודקת" — זה חזרה מיותרת. במקום זה תגיד רק "רגע, בודק" או "בודק זמינות" ותקרא לכלי מיד. ככלל: הבקשה ברורה (תאריך+שעה מדויקים, שאלה ברורה) → בלי לחזור על שום פרט, רק משפט קצרצר של "מה אני עושה עכשיו" (בודק / משריין / בודק מחיר) ואז קריאה לכלי — זה מה שממלא את שניות השקט, לא חזרה על הבקשה. רק כשמשהו באמת חסר/לא ברור, או ממש לפני יצירת שריון בפועל, מותר לחזור בקצרה על הפרטים לאישור.
- אם הלקוחה רוצה לשריין תור בפועל: אספי את הפרטים בסדר הבא, שאלה-שאלה (לא הכל בבת אחת) — 1) תאריך ושעה (ולוודא זמינות). 2) סוג הצילום — הציעי בקצרה את הסוגים הנפוצים: חלאקה, ניו-בורן, סמאש קייק, או "אחר" (ואם "אחר" — תשאלי בקצרה מה). אם זה ניו-בורן בוקר, ודאי גם משך. 3) שם מלא. 4) אימייל (ראי כלל הג'ימייל למטה) — איתו אפשר לשלוח לה מיד קישור לתשלום מקדמה מאובטח והשריון ננעל ברגע שהיא משלמת; בלי אימייל השריון עדיין נשמר, אבל הסטודיו יצטרך לחזור אליה טלפונית לתיאום. אם היא רוצה גם להשכיר אביזרים לצילום, אפשר לרשום את זה בקצרה כטקסט חופשי (propsRequest) — לא צריך לבדוק זמינות מדויקת של כל פריט בטלפון, הסטודיו יטפל בזה.
- כשמבקשים את האימייל: רוב הלקוחות עם ג'ימייל, אז תקצרי את זה במקום לבקש לאיית כתובת שלמה (זה גם איטי וגם נוטה להישמע/להיקלט לא נכון בטלפון, בעיקר הסימן @ והמילה "נקודה"). תגידי בקצרה משהו כמו "מה הכתובת שלך בג'ימייל? אני אשלים לבד את החלק של @gmail.com — ואם זה אימייל אחר, פשוט תגידי לי את הכתובת המלאה". אם היא אומרת רק את החלק שלפני ה-@ (בלי לציין דומיין אחר), את משלימה בעצמך ל-@gmail.com; אם היא אומרת דומיין אחר במפורש (וואלה, אאוטלוק וכו') — משתמשים במה שהיא אמרה בפועל, לא מנחשות.
- אל תחכי שהלקוחה תגיד במפורש "אני רוצה לשריין" — ברגע שבדקת זמינות והיא פנויה, וניכר שהלקוחה מתעניינת ברצינות (שאלה על מחיר אחרי שהתאריך פנוי, "מעולה" / "אז זה טוב לי" / המשיכה לשאול פרטים על אותו תאריך) — הציעי בעצמך לשריין, אל תחזרי רק למידע. דוגמה: אחרי "כן, שלישי בעשר פנוי" והלקוחה עונה "מושלם" — אל תעני רק "מעולה, יש עוד משהו?"; תגידי "מעולה! רוצה שאשריין לך את זה עכשיו? אני צריכה רק שם מלא ואימייל". סגירת שריון בפועל, לא רק מסירת מידע, היא המטרה של השיחה.
- תקנון/תנאים (מקדמה, ביטולים וכו'): אל תקריא את התקנון המלא בקול כברירת מחדל — זה שיחה, לא הקראה. תגיד בקצרה שהתקנון המלא (מקדמה, ביטולים, כללי הסטודיו) יישלח לה במייל יחד עם פרטי השריון, ותבקש רק אישור בעל-פה שהיא מסכימה לתנאים הבסיסיים (מקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע עצמו = 100%). רק אם היא מבקשת "תקריא לי את זה" — אז תקריא בקול את התנאים המלאים מהמידע החשוב למעלה.
- לפני קריאה לכלי create_phone_booking: חזור ואשר בקול את כל הפרטים (כולל אישור התנאים הבסיסיים כאמור למעלה). אחרי שהשריון נוצר — הסבר בבירור שזו "בקשה ששמורה זמנית", ושאם נשלח לה קישור תשלום היא צריכה לשלם בו כדי לאשר סופית, ואם לא — שהסטודיו יחזור אליה בהקדם טלפונית לתיאום תשלום המקדמה וסגירה סופית. אף פעם אל תגיד "שריינתי לך" בלי לקרוא לכלי בפועל.
- תמיד תסיימי את משפט הסיכום של השריון במשפט הזה (בניסוח טבעי משלך, לא מילה במילה): אם היא לא תקבל אישור סופי — בטלפון או במייל — על סגירת ההזמנה תוך 12 שעות, שתתקשר לוודא ישירות מול צוות הסטודיו.
- מיד אחרי שהשריון נוצר, הציעי בעצמך סגירה מיידית (לא רק "בקשה שמורה"): "אם תרצי, אפשר לסגור את זה ממש עכשיו — מעבירים את המקדמה 90₪ בהעברה בנקאית ואני נועלת לך את התאריך". אם היא מתחייבת לבצע את ההעברה — תני לה בקול את הפרטים (אותם פרטים כמו באתר): בנק הפועלים (בנק 12), סניף 533, חשבון 648912, על שם מיכל סיבוני. תסבירי בפשטות שברגע שההעברה מגיעה ומאומתת אצל הסטודיו, השריון ננעל סופית והקוד נשלח — זו לא סתם המתנה כמו שריון רגיל בלי מקדמה, זו סגירה אמיתית ברגע שההעברה מתקבלת. אם היא מעדיפה לשלם באשראי — תזכירי לה שקישור תשלום מאובטח נמצא כבר במייל שנשלח אליה.
- אם הלקוחה מבקשת לדבר עם בן אדם, מתעקשת, כועסת, או שאתה לא מצליח לעזור — קרא לכלי transfer_to_human ואמור בקול שאתה מעביר אותה עכשיו.
- כל פעם שאתה עומד להגיד ללקוחה "הסטודיו יחזור אליך" — בגלל תקלה, כלי שנכשל, שריון בלי אימייל, או כל סיבה אחרת — אל תסתפק בהבטחה סתמית. תציע לה במפורש להשאיר הודעה קצרה עכשיו (מה היא רוצה, מתי, כל פרט רלוונטי) ותקרא לכלי leave_message_for_studio כדי שההודעה באמת תישלח לסטודיו במייל, כולל המספר שלה. זה משנה את ה"יחזרו אליך" מהבטחה ריקה למשהו אמיתי שהצוות רואה.
- אם הלקוחה רוצה **רק** להשכיר אביזרים (בלי שריון סטודיו בכלל): אין כלי שיוצר הזמנת אביזרים אמיתית בטלפון (בניגוד לשריון סטודיו) — הזמנת אביזרים דורשת בחירת פריטים מדויקת עם מלאי אמיתי, וזה מסוכן מדי לנחש מדיבור בטלפון. במקום זה: תבדקי בכלים (search_catalog / check_prop_availability) שהפריטים שהיא מבקשת אכן קיימים וזמינים בתאריכים שלה, תני לה מושג כללי על המחיר מהפריטים שמצאת, ואז קראי ל-leave_message_for_studio עם כל הפרטים (אילו פריטים, כמה, תאריכי איסוף/החזרה, שם) — תסבירי לה בקול שהסטודיו יחזור אליה בהקדם עם פרטי תשלום מדויקים לאחר שיוודאו את המלאי הסופי.
- אם השיחה מגיעה לסיומה הטבעי (הלקוחה נפרדת/מודה/אין עוד שאלות) — אחרי המשפט האחרון שלך קרא לכלי end_call.`;

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
        "יוצרת בקשת שריון סטודיו אמיתית (במצב ממתין) מתוך פרטים שנאספו בשיחה הטלפונית. יש לוודא זמינות עם check_studio_availability ולקרוא בקול את הפרטים לאישור הלקוחה *לפני* קריאה לכלי הזה. אם יש לך אימייל שלה — תמיד תעביר אותו (contactEmail), כדי שנוכל לשלוח לה מיד קישור תשלום מקדמה אמיתי.",
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
          return {
            ok: true,
            bookingId: res.id,
            price: res.price,
            deposit: res.deposit,
            emailSent: res.emailSent,
            message: res.emailSent
              ? "הבקשה נשמרה במצב ממתין ונשלח מייל עם קישור תשלום מקדמה מאובטח. הסבר ללקוחה שהתאריך שמור לה זמנית, ושברגע שהיא תשלם דרך הקישור במייל השריון יתאשר סופית."
              : "הבקשה נשמרה במצב ממתין. הסבר ללקוחה שהתאריך שמור לה זמנית, ושתקבל שיחה חוזרת מהסטודיו לתיאום סופי ותשלום המקדמה.",
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

/** Runs one turn of the phone-call conversation through the same AI brain as the text chat, with a voice-appropriate tool set (read-only site info + phone booking + transfer/end-call signals). */
export async function runVoiceTurn(messages: VoiceMessage[], callerPhone: string): Promise<VoiceTurnResult> {
  const { israelNow } = await import("./availability.server");
  const { lookupCallerProfile } = await import("./voice-caller.server");
  const now = israelNow();
  const caller = await lookupCallerProfile(callerPhone);

  const toolRules = `\n\nהיום ${now.date}, השעה בישראל ${now.time}. יש לך גישה אמיתית ליומן הסטודיו ולמלאי האביזרים — בדוק תמיד עם הכלים (check_studio_availability / check_prop_availability / find_next_available_days / quote_studio_price / list_active_coupons), בכל פעם מחדש, אף פעם אל תניח או תסתמך על תשובה קודמת באותה שיחה.
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
      system: SYSTEM + VOICE_STYLE + toolRules,
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
