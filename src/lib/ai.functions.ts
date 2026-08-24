import { createServerFn } from "@tanstack/react-start";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { buildAssistantTools } from "./ai-tools.server";
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
- אם לקוחה עם חשבון אישי אמיתי (לא אורחת) ממש מתקשה להשלים את התהליך לבד (למשל בעיה טכנית, או פשוט מעדיפה שתעשי את זה בשבילה) — יש לך אפשרות ליצור עבורה שריון בפועל דרך create_studio_booking, בכפוף לכל התנאים המפורטים בתיאור הכלי. זה לא ברירת מחדל — קודם כל תמיד הציעי לה להשלים בעצמה דרך /booking, והשתמשי בכלי הזה רק אם היא ממש מבקשת עזרה בביצוע בפועל. לפני שקוראים לכלי, את חייבת:
  1. לוודא זמינות אמיתית עם check_studio_availability.
  2. לשאול ולקבל: שם מלא, טלפון, אימייל (חובה — לשם נשלח אישור וכל ההתכתבות, בדיוק כמו בהזמנה רגילה).
  3. לשאול את פרטי השאלון המקוצר (כמו בעמוד /studio-rental): סוג הצילום (משפחתי/ניו-בורן/חלאקה/אחר), כמה אנשים בערך, גיל התינוק/ת אם רלוונטי, האם יש מצלמה או צריך המלצה, ניסיון עם פלאש, האם צריך אביזרים, ובקשות מיוחדות (הכל אופציונלי חוץ מסוג הצילום — אם לקוחה לא יודעת/לא רוצה לענות על שדה מסוים, אפשר לדלג).
  4. להציג לה בפירוש (לא רק לינק!) את התנאים המרכזיים לפני שמבקשים אישור: המקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע עצמו = 100% מהסכום, נזק = עלות תיקון/רכישה +20% דמי טיפול, ניקיון לא תקין = 150₪. ואז לקבל ממנה הודעה מפורשת שהיא מסכימה לכל זה.
  5. לשאול איך היא מתכננת לשלם את המקדמה — האם היא כבר העבירה/תעביר עכשיו (ואם כן דרך מה: העברה בנקאית או ביט), או שהיא תשלם אחר כך. בכל מקרה תסבירי לה בסוף שהשריון מאושר סופית רק אחרי שהמקדמה בפועל התקבלה/אושרה, ושהיא צריכה לוודא זאת דרך /account.
  לקוחה שהיא "אורחת"/לא מחוברת עם חשבון אמיתי — לעולם אל תשתמשי בכלי הזה, גם אם היא מתעקשת. הסבירי בעדינות שליצירת שריון דרך הצ'אט צריך חשבון אישי אמיתי (לא כניסת אורח), והציעי לה להירשם ב-/auth או להזמין לבד ב-/booking (שם אפשר גם כאורחת).

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
  // Client-generated (crypto.randomUUID, kept in sessionStorage) so the
  // whole conversation logs as one growing row instead of one per message —
  // see customer_chat_logs / listChatLogs.
  sessionId: z.string().max(80).optional(),
});

export const chatWithBot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ChatInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    // The client's `isAuthenticated` flag is only used for tone/wording —
    // it's untrusted. Whether create_studio_booking is actually allowed to
    // run is decided below from the real, server-verified token.
    const { userId: realUserId, isRealAccount } = await getRealAuthState();
    const personalized = data.isAuthenticated
      ? `\n\nהמשתמשת מחוברת לחשבון${data.userName ? ` בשם ${data.userName}` : ""}. את יכולה לפנות אליה בשמה.`
      : `\n\nהמשתמשת לא מחוברת. לביצוע הזמנה בפועל הציעי לה להתחבר בעמוד /auth — אבל בדיקת זמינות אפשר לעשות גם בלי התחברות.`;
    const { israelNow } = await import("./availability.server");
    const now = israelNow();

    const toolRules = `\n\nהיום ${now.date}, השעה בישראל ${now.time}. יש לך גישה אמיתית ליומן הסטודיו (כולל אירועים שהוזנו ישירות ביומן גוגל) ולמלאי האביזרים — הנתונים חיים ומדויקים לכל לקוחה, גם בלי התחברות:
- שתי בדיקות זמינות שונות לגמרי, אסור לערבב ביניהן: check_studio_availability בודקת רק אם **הסטודיו עצמו** (המקום הפיזי, לפי שעות) פנוי. check_prop_availability בודקת רק אם **אביזר להשכרה** (מק״ט/שם) פנוי בטווח תאריכים — לאביזר אין שעות, רק ימים. שאלה על אביזר ("האם X פנוי", "אפשר לשכור Y") — אף פעם אל תבדקי/תזכירי זמינות הסטודיו, זה לא רלוונטי אליה. שאלה על שריון הסטודיו עצמו — רק check_studio_availability.
- זמינות סטודיו בתאריך/שעה — חובה check_studio_availability, **בכל פעם מחדש, גם אם כבר בדקת תאריך/שעה דומים קודם באותה שיחה**. אסור להסתמך על "היום היה פנוי אז כנראה גם מחר פנוי" או על תשובה קודמת בשיחה — כל תאריך ושעה זו בדיקה נפרדת לגמרי, כי הזמינות משתנה כל הזמן (שריונים חדשים נכנסים). ענִי אך ורק לפי התוצאה של הבדיקה הנוכחית, לעולם אל תניחי שפנוי ואל תפני את הלקוחה "לבדוק בעמוד היומן" במקום לבדוק בעצמך.
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
      tools: buildAssistantTools({ isAuthenticated: isRealAccount }),
      stopWhen: stepCountIs(8),
    });

    // Log the whole conversation so far (every visit, not just ones that
    // book something) — one upserted row per browser session, not one
    // insert per message.
    if (data.sessionId) {
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
    }

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
