import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { generateTextResilient } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
import { SYSTEM } from "./ai.functions";
import { createPhoneBooking } from "./voice-booking.server";
import { sendMessageToStudio } from "./voice-message.server";

export type VoiceMessage = { role: "user" | "assistant"; content: string };

const VOICE_STYLE = `\n\nאתה עונה כרגע בשיחת טלפון קולית — הלקוחה שומעת אותך, לא קוראת. חשוב מאוד:
- דבר במשפטים קצרים וטבעיים לדיבור, בלי רשימות, בלי כוכביות, בלי אימוג׳ים, בלי קישורים (היא לא יכולה ללחוץ על שום דבר). הלקוחה מתקשרת כי אין לה גישה נוחה לאינטרנט — אל תגיד "לחצי" / "עברי לעמוד" / "ראי באתר".
- אסור בהחלט לפתוח משפט ב"אז את אומרת ש..." / "אז את רוצה ש..." / "הבנתי, את..." / "אוקיי, אז..." — זה הרגל קבוע שגורם לך להישמע רובוטי, וזה בדיוק מה שהתבקשת להפסיק לעשות. דוגמה למה שלא לומר: לקוחה אומרת "אני רוצה לבדוק אם פנוי ביום שלישי בשעה עשר" ואתה עונה "אז את רוצה לבדוק זמינות ביום שלישי בעשר, רגע אני בודקת" — זה חזרה מיותרת. במקום זה תגיד רק "רגע, בודק" או "בודק זמינות" ותקרא לכלי מיד. ככלל: הבקשה ברורה (תאריך+שעה מדויקים, שאלה ברורה) → בלי לחזור על שום פרט, רק משפט קצרצר של "מה אני עושה עכשיו" (בודק / משריין / בודק מחיר) ואז קריאה לכלי — זה מה שממלא את שניות השקט, לא חזרה על הבקשה. רק כשמשהו באמת חסר/לא ברור, או ממש לפני יצירת שריון בפועל, מותר לחזור בקצרה על הפרטים לאישור.
- אם הלקוחה רוצה לשריין תור בפועל: אסוף בשיחה שם מלא, תאריך, שעה, משך (או אם זה ניו-בורן בוקר), וסוג הצילום. נסה גם לקבל אימייל — איתו אפשר לשלוח לה מיד קישור לתשלום מקדמה מאובטח והשריון ננעל ברגע שהיא משלמת; בלי אימייל השריון עדיין נשמר, אבל הסטודיו יצטרך לחזור אליה טלפונית לתיאום. אם היא רוצה גם להשכיר אביזרים לצילום, אפשר לרשום את זה בקצרה כטקסט חופשי (propsRequest) — לא צריך לבדוק זמינות מדויקת של כל פריט בטלפון, הסטודיו יטפל בזה.
- תקנון/תנאים (מקדמה, ביטולים וכו'): אל תקריא את התקנון המלא בקול כברירת מחדל — זה שיחה, לא הקראה. תגיד בקצרה שהתקנון המלא (מקדמה, ביטולים, כללי הסטודיו) יישלח לה במייל יחד עם פרטי השריון, ותבקש רק אישור בעל-פה שהיא מסכימה לתנאים הבסיסיים (מקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע עצמו = 100%). רק אם היא מבקשת "תקריא לי את זה" — אז תקריא בקול את התנאים המלאים מהמידע החשוב למעלה.
- לפני קריאה לכלי create_phone_booking: חזור ואשר בקול את כל הפרטים (כולל אישור התנאים הבסיסיים כאמור למעלה). אחרי שהשריון נוצר — הסבר בבירור שזו "בקשה ששמורה זמנית", ושאם נשלח לה קישור תשלום היא צריכה לשלם בו כדי לאשר סופית, ואם לא — שהסטודיו יחזור אליה בהקדם טלפונית לתיאום תשלום המקדמה וסגירה סופית. אף פעם אל תגיד "שריינתי לך" בלי לקרוא לכלי בפועל.
- אם הלקוחה מבקשת לדבר עם בן אדם, מתעקשת, כועסת, או שאתה לא מצליח לעזור — קרא לכלי transfer_to_human ואמור בקול שאתה מעביר אותה עכשיו.
- כל פעם שאתה עומד להגיד ללקוחה "הסטודיו יחזור אליך" — בגלל תקלה, כלי שנכשל, שריון בלי אימייל, או כל סיבה אחרת — אל תסתפק בהבטחה סתמית. תציע לה במפורש להשאיר הודעה קצרה עכשיו (מה היא רוצה, מתי, כל פרט רלוונטי) ותקרא לכלי leave_message_for_studio כדי שההודעה באמת תישלח לסטודיו במייל, כולל המספר שלה. זה משנה את ה"יחזרו אליך" מהבטחה ריקה למשהו אמיתי שהצוות רואה.
- אם השיחה מגיעה לסיומה הטבעי (הלקוחה נפרדת/מודה/אין עוד שאלות) — אחרי המשפט האחרון שלך קרא לכלי end_call.`;

function buildVoiceTools(callerPhone: string) {
  const base = buildAssistantTools({ isAuthenticated: false });
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

/** Runs one turn of the phone-call conversation through the same AI brain as the text chat, with a voice-appropriate tool set (read-only site info + phone booking + transfer/end-call signals). */
export async function runVoiceTurn(messages: VoiceMessage[], callerPhone: string): Promise<VoiceTurnResult> {
  const { israelNow } = await import("./availability.server");
  const now = israelNow();

  const toolRules = `\n\nהיום ${now.date}, השעה בישראל ${now.time}. יש לך גישה אמיתית ליומן הסטודיו ולמלאי האביזרים — בדוק תמיד עם הכלים (check_studio_availability / check_prop_availability / find_next_available_days / quote_studio_price / list_active_coupons), בכל פעם מחדש, אף פעם אל תניח או תסתמך על תשובה קודמת באותה שיחה.
כשהלקוחה שואלת משהו שקל יותר לראות בעיניים (תמונות מהסטודיו, קטלוג האביזרים המלא, גלריה) — הצע לה קודם, בקצרה, שאפשר גם לחפש בגוגל "סטודיו סוויט בייבי" ולראות הכול באתר. אם היא אומרת שזה לא נוח לה כרגע (בלי גישה נוחה לאינטרנט, מעדיפה לסגור עכשיו בטלפון וכו׳) — המשך ותעזור לה לשריין ישירות בשיחה, בלי לחזור ולהפנות אותה לאתר.`;

  // Tighter budget than the site-chat default: on a phone call the platform
  // itself (Twilio/Yemot) is independently timing out the webhook while
  // this runs, and it's far less patient than a browser tab — so this needs
  // to fail fast enough to matter, not just eventually. Also capped at 4
  // tool-call rounds instead of 8: fewer rounds means a lower worst-case
  // total latency, and a voice turn realistically needs at most 1-2 tool
  // calls before it has an answer.
  const result = await generateTextResilient(
    {
      system: SYSTEM + VOICE_STYLE + toolRules,
      messages,
      tools: buildVoiceTools(callerPhone),
      stopWhen: stepCountIs(4),
    },
    10_000,
  );

  let action: VoiceTurnResult["action"] = "continue";
  for (const step of result.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName === "transfer_to_human") action = "transfer";
      else if (call.toolName === "end_call" && action === "continue") action = "hangup";
    }
  }

  return { text: result.text, action };
}
