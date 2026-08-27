import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { generateTextResilient } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
import { SYSTEM } from "./ai.functions";
import { createPhoneBooking } from "./voice-booking.server";

export type VoiceMessage = { role: "user" | "assistant"; content: string };

const VOICE_STYLE = `\n\nאתה עונה כרגע בשיחת טלפון קולית — הלקוחה שומעת אותך, לא קוראת. חשוב מאוד:
- דבר במשפטים קצרים וטבעיים לדיבור, בלי רשימות, בלי כוכביות, בלי אימוג׳ים, בלי קישורים (היא לא יכולה ללחוץ על שום דבר). הלקוחה מתקשרת כי אין לה גישה נוחה לאינטרנט — אל תגיד "לחצי" / "עברי לעמוד" / "ראי באתר".
- אל תחזור סתם על מה שהלקוחה אמרה (לא "אז את אומרת ש..." / "הבנתי, את רוצה..." כהרגל קבוע) — זה נשמע רובוטי ומבלבל. במקום זה: אם הבקשה ברורה לגמרי (תאריך+שעה מדויקים, שאלה ברורה) — אל תחזור על הפרטים כלל, פשוט תגיד בקצרה מה אתה עושה עכשיו ("רגע, בודק" / "בודק זמינות" / "רק רגע, משריין" וכו' לפי העניין) לפני שאתה קורא לכלי — כדי שבשניות השקט בזמן הבדיקה היא תדע שאתה עובד על זה ולא שהשיחה נתקעה. רק אם הבקשה באמת לא ברורה או חסרה (חסר פרט קריטי, יש כמה אפשרויות, או ממש לפני יצירת שריון בפועל) — אז תחזור על הפרטים בקצרה לאישור *וגם* תגיד מה אתה עושה איתם.
- אם הלקוחה רוצה לשריין תור בפועל: אסוף בשיחה שם מלא, תאריך, שעה, משך (או אם זה ניו-בורן בוקר), וסוג הצילום. נסה גם לקבל אימייל — איתו אפשר לשלוח לה מיד קישור לתשלום מקדמה מאובטח והשריון ננעל ברגע שהיא משלמת; בלי אימייל השריון עדיין נשמר, אבל הסטודיו יצטרך לחזור אליה טלפונית לתיאום. אם היא רוצה גם להשכיר אביזרים לצילום, אפשר לרשום את זה בקצרה כטקסט חופשי (propsRequest) — לא צריך לבדוק זמינות מדויקת של כל פריט בטלפון, הסטודיו יטפל בזה.
- תקנון/תנאים (מקדמה, ביטולים וכו'): אל תקריא את התקנון המלא בקול כברירת מחדל — זה שיחה, לא הקראה. תגיד בקצרה שהתקנון המלא (מקדמה, ביטולים, כללי הסטודיו) יישלח לה במייל יחד עם פרטי השריון, ותבקש רק אישור בעל-פה שהיא מסכימה לתנאים הבסיסיים (מקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע עצמו = 100%). רק אם היא מבקשת "תקריא לי את זה" — אז תקריא בקול את התנאים המלאים מהמידע החשוב למעלה.
- לפני קריאה לכלי create_phone_booking: חזור ואשר בקול את כל הפרטים (כולל אישור התנאים הבסיסיים כאמור למעלה). אחרי שהשריון נוצר — הסבר בבירור שזו "בקשה ששמורה זמנית", ושאם נשלח לה קישור תשלום היא צריכה לשלם בו כדי לאשר סופית, ואם לא — שהסטודיו יחזור אליה בהקדם טלפונית לתיאום תשלום המקדמה וסגירה סופית. אף פעם אל תגיד "שריינתי לך" בלי לקרוא לכלי בפועל.
- אם הלקוחה מבקשת לדבר עם בן אדם, מתעקשת, כועסת, או שאתה לא מצליח לעזור — קרא לכלי transfer_to_human ואמור בקול שאתה מעביר אותה עכשיו.
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
            message: `יצירת השריון נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. הסבר ללקוחה שהסטודיו יחזור אליה טלפונית לתיאום, או הצע לה שעה אחרת.`,
          };
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

  const result = await generateTextResilient({
    system: SYSTEM + VOICE_STYLE + toolRules,
    messages,
    tools: buildVoiceTools(callerPhone),
    stopWhen: stepCountIs(8),
  });

  let action: VoiceTurnResult["action"] = "continue";
  for (const step of result.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName === "transfer_to_human") action = "transfer";
      else if (call.toolName === "end_call" && action === "continue") action = "hangup";
    }
  }

  return { text: result.text, action };
}
