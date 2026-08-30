// Server-only: the admin-panel counterpart to voice-chat.server.ts's
// admin_search_email/admin_read_email_body/admin_send_email voice tools —
// same underlying Gmail read/send functions, same admin-only gate, just
// reached from the web (/admin/email-assistant) instead of by phone+PIN.
// No PIN check here: this route already sits behind requireSupabaseAuth +
// the admin-role check, the same gate every other /admin/* page uses.
import { createServerFn } from "@tanstack/react-start";
import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateTextResilient } from "./ai-gateway.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

/** Compose-and-send from the admin panel — the same connected Gmail account as sendGmail everywhere else in the app. */
export const sendAdminEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const html = data.body.replace(/\n/g, "<br>");
    const sent = await sendGmail({ to: data.to, subject: data.subject, html });
    if (!sent) throw new Error("השליחה נכשלה — בדקי שהחיבור ל-Gmail תקין (LOVABLE_API_KEY / GOOGLE_MAIL_API_KEY)");
    return { ok: true };
  });

const askSchema = z.object({ question: z.string().min(1).max(500) });

/**
 * A small, self-contained AI-tool loop (same shape as runVoiceTurn's, just
 * text-only and single-turn) that answers a free-text question about the
 * connected inbox by searching/reading it live — never invents an answer
 * from the question alone. Kept separate from the site-chat/voice tool
 * sets on purpose: those are customer-facing and must never be able to
 * read the studio's actual mailbox.
 */
export const askEmailAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => askSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { searchGmail, getGmailMessageBody } = await import("@/integrations/google/gmail.server");

    const tools = {
      search_email: tool({
        description:
          'מחפשת בתיבת המייל המחוברת של הסטודיו (Gmail). query הוא ביטוי חיפוש בסגנון Gmail (למשל "from:ישראל", "is:unread", מילות מפתח). מחזירה תקצירים קצרים בלבד — לתוכן מלא של מייל ספציפי קראי אחר כך ל-read_email_body עם ה-id.',
        inputSchema: z.object({ query: z.string().min(1) }),
        execute: async ({ query }) => {
          const results = await searchGmail(query, 8);
          return results.length === 0 ? { results: [], note: "לא נמצאו מיילים תואמים." } : { results };
        },
      }),
      read_email_body: tool({
        description: "מחזירה את התוכן המלא (טקסט) של מייל אחד, לפי id מתוצאות search_email.",
        inputSchema: z.object({ id: z.string().min(1) }),
        execute: async ({ id }) => {
          const body = await getGmailMessageBody(id);
          return body ? { body: body.slice(0, 4000) } : { error: "לא הצלחתי לשלוף את תוכן המייל." };
        },
      }),
    };

    const result = await generateTextResilient(
      {
        system:
          "את עוזרת של הצלמת שעונה על שאלות לגבי תיבת המייל המחוברת (Gmail) של הסטודיו. תמיד תחפשי/תקראי בפועל עם הכלים לפני שתעני — אל תמציאי תשובה מהדמיון. אם לא מצאת מייל רלוונטי, תגידי זאת בפירוש במקום לנחש. תעני בעברית, בקצרה וברור.",
        messages: [{ role: "user", content: data.question }],
        tools,
        stopWhen: stepCountIs(5),
      },
      30_000,
    );

    return { answer: result.text };
  });
