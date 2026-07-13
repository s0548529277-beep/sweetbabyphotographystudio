import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import catalogData from "@/data/studio-catalog.json";

const SYSTEM = `את עוזרת וירטואלית של סטודיו Sweetbaby - סטודיו בוטיק להשכרת אביזרים וצילומי ניו-בורן/משפחה בבית שמש. עני בעברית, קצר, חמים ומקצועי. אל תמציאי מידע. אם לא יודעת - כווני לצור קשר במייל s0548529277@gmail.com או בטלפון 054-8529277.

מידע חשוב:
- כתובת: תלמוד ירושלמי 24, בית שמש
- שעות סטודיו: 120₪ לשעה, 90₪ לכל שעה נוספת
- חבילת ניו-בורן: 240₪ ל-3 שעות (עד 13:00)
- מנויים: 10% הנחה קבועה
- מינימום הזמנת אביזרים: 50₪
- אביזרים נאספים ומוחזרים תוך 24 שעות; איחור מעל 3 שעות = חצי מעלות ההשכרה נוספת; כל יום נוסף = תוספת מלאה
- תשלום מתבצע לפני לקיחת האביזרים
- הזמנה מהווה הסכמה לתנאים
- צילומים עם הצלמת מיכל סיבוני: 300₪ לשעה, 150₪ לחצי שעה, בניית סטים בתוספת 100₪`;

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
});

export const chatWithBot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ChatInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      system: SYSTEM,
      messages: data.messages,
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
