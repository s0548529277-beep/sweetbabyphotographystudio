import { createServerFn } from "@tanstack/react-start";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
import catalogData from "@/data/studio-catalog.json";


const SYSTEM = `את "נועה", העוזרת האישית של סטודיו Sweetbaby — סטודיו בוטיק בבית שמש להשכרת סטודיו, השכרת אביזרים וצילומי ניו-בורן/משפחה.
סגנון: עברית חמה, נעימה ואישית, בגובה העיניים, משפטים קצרים, אימוג׳י עדין פה ושם (💗 ✨) בלי להגזים. פני ללקוחה בלשון נקבה. תמיד תני תשובה מועילה וקונקרטית, ואל תסתפקי ב"אני לא יודעת" — קודם נסי לבדוק עם הכלים שלך.
אל תמציאי מידע. אם באמת אין לך תשובה — הציעי בחמימות ליצור קשר: s0548529277@gmail.com · 054-8529277.

מידע חשוב (עדכני):
- כתובת: תלמוד ירושלמי 24, בית שמש
- שעות פעילות: א׳–ה׳ 8:00–23:00 · ו׳/ערב חג: עד שעתיים לפני כניסת השבת · מוצ״ש: משעה אחרי צאת השבת
- מחירון סטודיו: שעה ראשונה 120₪, כל שעה נוספת 90₪, חצי שעה בחישוב יחסי
- מבצע ניו-בורן בוקר: 3 שעות ב-240₪, בחלונות 8:00–11:00 / 9:00–12:00 / 10:00–13:00 (רק למי שבחרה ניו-בורן בשאלון)
- עיכוב: 15 דק׳ = חצי שעה נוספת · 45 דק׳ = שעה מלאה. חובה לעדכן לפני שמאחרים!
- שריון מועד: מקדמה 90₪ (לא מוחזרת) בהעברה בנקאית/ביט. ביום האירוע — תשלום מלא מראש.
- ביטול: עד יום האירוע — המקדמה לא מוחזרת. ביום עצמו — 100%.
- קוד קופון BABY10 מזכה ב-10% הנחה.
- חבילות הדרכה (תוספת חד-פעמית): בסיסי חינם (עד 5 דק׳) · MINI 50₪ (עד 20 דק׳, סט אחד) · PLUS 100₪ (2 סטים + הדרכה, הכי פופולרי) · PREMIUM 150₪ (מעטפת מלאה)
- תהליך הזמנת סטודיו: 1) הסכם תיאום ציפיות בעמוד /studio-rental → 2) בחירת תאריך ושעה בעמוד /booking → 3) תשלום מקדמה. פרטי הקשר עוברים אוטומטית בין השלבים.

אביזרים להשכרה:
- 400+ אביזרים בקטלוג /rental-catalog · מינימום הזמנה 50₪
- תמחור לפי 24 שעות — עד 24 שעות = מחיר בסיס, 48 שעות = כפול, וכן הלאה
- בחירת אביזרים בהשכרת סטודיו היא אופציונלית לגמרי — עד 20 אביזרים חינם (בכפוף לזמינות)
- אביזרים ששוריינו להזמנת סטודיו נחסמים אוטומטית גם בקטלוג ההשכרה לאותו תאריך
- נזק: עלות תיקון/רכישה + 20% דמי טיפול
- ניקיון: יש להחזיר את הסטודיו מסודר. בלגן משמעותי — 150₪ דמי ניקיון.

צילומים עם הצלמת מיכל סיבוני: 300₪ לשעה, 150₪ לחצי שעה, בניית סטים בתוספת 100₪ · פרטים בעמוד /studio-photography`;


const ChatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
  userName: z.string().max(80).optional(),
  isAuthenticated: z.boolean().optional(),
});

export const chatWithBot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ChatInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const personalized = data.isAuthenticated
      ? `\n\nהמשתמשת מחוברת לחשבון${data.userName ? ` בשם ${data.userName}` : ""}. את יכולה לפנות אליה בשמה.`
      : `\n\nהמשתמשת לא מחוברת. לביצוע הזמנה בפועל הציעי לה להתחבר בעמוד /auth — אבל בדיקת זמינות אפשר לעשות גם בלי התחברות.`;
    const today = new Date().toISOString().slice(0, 10);
    const toolRules = `\n\nהיום ${today}. יש לך גישה אמיתית ליומן ולמלאי:
- לשאלה על זמינות הסטודיו בתאריך/שעה — חובה להשתמש בכלי check_studio_availability ולענות רק לפי התוצאה. אל תניחי שפנוי.
- לשאלה אם אביזר מסוים פנוי (לפי מק״ט או שם) — חובה להשתמש בכלי check_prop_availability ולענות רק לפי התוצאה.
- אם חסר תאריך — בקשי תאריך קודם. המירי ביטויים כמו "מחר" לתאריך מלא YYYY-MM-DD לפי היום הנוכחי.
- אחרי תשובה חיובית — הציעי להמשיך: סטודיו בעמוד /studio-rental (טופס ואז יומן), אביזרים בעמוד /rental-catalog.`;
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      system: SYSTEM + personalized + toolRules,
      messages: data.messages,
      tools: buildAssistantTools(),
      stopWhen: stepCountIs(5),
    });
    return { reply: text };
  });


const SearchInput = z.object({ query: z.string().min(1).max(200) });

export const smartSearchItems = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    type Cat = { title: string; items: { sku: string; name: string; alt: string; price: number }[] };
    const cats = catalogData as Cat[];
    const summary = cats
      .map(
        (c) =>
          `[${c.title}] ` +
          c.items.map((i) => `#${i.sku}:${i.name || i.alt}`).join(", "),
      )
      .join("\n");

    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
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
