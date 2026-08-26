import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { generateTextResilient } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
import { SYSTEM } from "./ai.functions";
import { createPhoneBooking } from "./voice-booking.server";

export type VoiceMessage = { role: "user" | "assistant"; content: string };

const VOICE_STYLE = `\n\nאת עונה כרגע בשיחת טלפון קולית — הלקוחה שומעת אותך, לא קוראת. חשוב מאוד:
- דברי במשפטים קצרים וטבעיים לדיבור, בלי רשימות, בלי כוכביות, בלי אימוג׳ים, בלי קישורים (היא לא יכולה ללחוץ על שום דבר). הלקוחה מתקשרת כי אין לה גישה נוחה לאינטרנט — אל תגידי "לחצי" / "עברי לעמוד" / "ראי באתר".
- אם הלקוחה רוצה לשריין תור בפועל: אספי בשיחה שם מלא, תאריך, שעה, משך (או אם זה ניו-בורן בוקר), וסוג הצילום. חזרי ואשרי בקול את הפרטים לפני שאת קוראת לכלי create_phone_booking. אחרי שהשריון נוצר — הסבירי בבירור שזו "בקשה ששמורה זמנית", ושהסטודיו יחזור אליה בהקדם טלפונית לתיאום תשלום המקדמה וסגירה סופית. אף פעם אל תגידי "שריינתי לך" בלי לקרוא לכלי בפועל.
- אם הלקוחה מבקשת לדבר עם בן אדם, מתעקשת, כועסת, או שאת לא מצליחה לעזור — קראי לכלי transfer_to_human ואמרי בקול שאת מעבירה אותה עכשיו.
- אם השיחה מגיעה לסיומה הטבעי (הלקוחה נפרדת/מודה/אין עוד שאלות) — אחרי המשפט האחרון שלך קראי לכלי end_call.`;

function buildVoiceTools(callerPhone: string) {
  const base = buildAssistantTools({ isAuthenticated: false });
  return {
    ...base,
    create_phone_booking: tool({
      description:
        "יוצרת בקשת שריון סטודיו אמיתית (במצב ממתין) מתוך פרטים שנאספו בשיחה הטלפונית. יש לוודא זמינות עם check_studio_availability ולקרוא בקול את הפרטים לאישור הלקוחה *לפני* קריאה לכלי הזה.",
      inputSchema: z.object({
        date: z.string().describe("YYYY-MM-DD"),
        startTime: z.string().describe("HH:MM"),
        hours: z.number().describe("משך בשעות, אפשר 1.5"),
        contactName: z.string(),
        sessionType: z.string().optional().describe("סוג הצילום, למשל משפחתי / ניו-בורן / חלאקה"),
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
            session_type: args.sessionType,
            notes: args.notes,
          });
          return {
            ok: true,
            bookingId: res.id,
            price: res.price,
            deposit: res.deposit,
            message: "הבקשה נשמרה במצב ממתין. הסבירי ללקוחה שהתאריך שמור לה זמנית, ושתקבל שיחה חוזרת מהסטודיו לתיאום סופי ותשלום המקדמה.",
          };
        } catch (e: any) {
          return {
            ok: false,
            message: `יצירת השריון נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. הסבירי ללקוחה שהסטודיו יחזור אליה טלפונית לתיאום, או הציעי לה שעה אחרת.`,
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

  const toolRules = `\n\nהיום ${now.date}, השעה בישראל ${now.time}. יש לך גישה אמיתית ליומן הסטודיו ולמלאי האביזרים — בדקי תמיד עם הכלים (check_studio_availability / check_prop_availability / find_next_available_days / quote_studio_price / list_active_coupons), בכל פעם מחדש, אף פעם אל תניחי או תסתמכי על תשובה קודמת באותה שיחה.`;

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
