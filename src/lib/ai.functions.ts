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
- קודי קופון: משתנים מדי פעם — לעולם אל תזכירי קוד מהזיכרון, תמיד תבדקי עם list_active_coupons ותני קוד אמיתי ועדכני.
- חבילות הדרכה (תוספת חד-פעמית לשריון סטודיו): בסיסי חינם (עד 5 דק׳ הכוונה) · MINI 50₪ (עד 20 דק׳ הדרכה טכנית, סט אחד) · PLUS 100₪ (ליווי מקצועי ראשוני, הכי פופולרי) · PREMIUM 300₪ (הצלמת מיכל איתך בסטודיו — 2 סטים יפים בהתאמה אישית, עד שעה)
- כרטיסיית מנוי SWEET 10+1 (11 כניסות סטודיו בתשלום מראש, כניסה = שעה ראשונה בהשכרת סטודיו): לא נרכשת אונליין — מי שמתעניינת, הפני אותה ליצירת קשר ישיר עם הסטודיו לתיאום. אם ללקוחה המחוברת יש כרטיסייה פעילה, אפשר להזכיר לה שיש לה כניסות זמינות ושהיא יכולה לסמן "השתמשי בכרטיסייה שלך" בעמוד /booking.
- תהליך הזמנת סטודיו: 1) הסכם תיאום ציפיות בעמוד /studio-rental → 2) בחירת תאריך ושעה בעמוד /booking → 3) תשלום מקדמה. פרטי הקשר עוברים אוטומטית בין השלבים.
- אם לקוחה מחוברת ממש מתקשה להשלים את התהליך לבד (למשל בעיה טכנית, או פשוט מעדיפה שתעשי את זה בשבילה) — יש לך אפשרות ליצור עבורה שריון בפועל דרך create_studio_booking, בכפוף לכל התנאים המפורטים בתיאור הכלי (אישור מפורש שלה על תנאי השימוש והמקדמה, פרטי קשר, ובדיקת זמינות קודם). זה לא ברירת מחדל — קודם כל תמיד הציעי לה להשלים בעצמה דרך /booking, והשתמשי בכלי הזה רק אם היא ממש מבקשת עזרה בביצוע בפועל.

אביזרים להשכרה:
- 400+ אביזרים בקטלוג /rental-catalog · מינימום הזמנה 50₪
- תמחור לפי 24 שעות — עד 24 שעות = מחיר בסיס, 48 שעות = כפול, וכן הלאה
- בחירת אביזרים בהשכרת סטודיו היא אופציונלית לגמרי — עד 20 אביזרים שריון חינם (בכפוף לזמינות)
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
    const { israelNow } = await import("./availability.server");
    const now = israelNow();

    const toolRules = `\n\nהיום ${now.date}, השעה בישראל ${now.time}. יש לך גישה אמיתית ליומן הסטודיו (כולל אירועים שהוזנו ישירות ביומן גוגל) ולמלאי האביזרים — הנתונים חיים ומדויקים לכל לקוחה, גם בלי התחברות:
- זמינות סטודיו בתאריך/שעה — חובה check_studio_availability. ענִי אך ורק לפי התוצאה, לעולם אל תניחי שפנוי ואל תפני את הלקוחה "לבדוק בעמוד היומן" במקום לבדוק בעצמך.
- "מתי יש לך פנוי?" בלי תאריך — השתמשי ב-find_next_available_days והציעי 2-3 מועדים קונקרטיים.
- זמינות אביזר לפי מק״ט או שם — חובה check_prop_availability. לחיפוש כללי בקטלוג — search_catalog.
- שאלת מחיר — חשבי עם quote_studio_price ואל תעריכי בעצמך.
- ביטויים כמו "מחר"/"יום שלישי הקרוב" — המירי לתאריך YYYY-MM-DD לפי התאריך הנוכחי (אפשר current_datetime).
- אם הכלי מחזיר calendarLinked=false — אמרי בעדינות שהבדיקה חלקית והציעי לאמת מול הסטודיו.
- כשתפוס — אל תעצרי שם: הציעי מיד חלופות קרובות מהכלי.
- אחרי תשובה חיובית — הזמיני להמשיך: סטודיו ב-/studio-rental (שאלון קצר ואז יומן), אביזרים ב-/rental-catalog.
- קוד קופון — לעולם אל תמציאי, תמיד תבדקי עם list_active_coupons.
- יצירת שריון בפועל בשם הלקוחה — רק עם create_studio_booking, ורק אחרי שמתקיימים כל התנאים בתיאור הכלי (זמינות אמיתית, פרטי קשר, אישור מפורש על תנאים ומקדמה). לעולם אל תגידי ללקוחה "שריינתי לך" בלי לקרוא לכלי הזה בפועל.`;
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      system: SYSTEM + personalized + toolRules,
      messages: data.messages,
      tools: buildAssistantTools({ isAuthenticated: !!data.isAuthenticated }),
      stopWhen: stepCountIs(8),
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
