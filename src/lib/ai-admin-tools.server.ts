import { tool } from "ai";
import { z } from "zod";

/**
 * Admin-only tools for the site chat (owner request 2026-10-27: "כשאני
 * נכנסת לניהול שיהיה לי את הבוט הזה עם כל יכולות הניהול … שיתחבר למיילים
 * שלי וידע להכין טיוטות"). Only spread into the tool list after the server
 * verified the caller is an admin (user_roles) — a customer's prompt never
 * even contains them (see ai-bot-efficiency skill: conditional tools).
 *
 * Rules baked in:
 * - Data questions are READ-ONLY (run_readonly_query RPC, same as /admin/site-bot-ask).
 * - Mail: search/read + create DRAFTS. Nothing here sends an email.
 * - Any change (order/booking/lead status) is only PROPOSED here; the chat
 *   shows a confirm button and the change runs only when she clicks it
 *   (client calls the normal admin server functions with her own session).
 */

export const ADMIN_CHAT_RULES = `

מצב ניהול: את מדברת עכשיו עם מיכל, בעלת הסטודיו (מנהלת מאומתת), לא עם לקוחה. פני אליה בגובה העיניים, קצר ומעשי.
- נתונים (הזמנות, הכנסות, לידים, לקוחות, ניו-בורן): admin_snapshot לסקירה מהירה; לכל שאלה אחרת — admin_query_data עם SELECT אחד. לעולם אל תמציאי מספר.
- פרטי קשר של לקוחה: admin_find_customer.
- מיילים: יש עוזר טיוטות אוטומטי שרץ לבד; "תכיני טיוטות עכשיו" → run_email_drafts_now. חיפוש/קריאה: gmail_search / gmail_read, וטיוטת תשובה — gmail_create_draft בלבד. את לא שולחת מיילים, רק טיוטות; אמרי לה שהטיוטה מחכה בתיקיית הטיוטות לבדיקה ושליחה שלה. לפני יצירת טיוטה הראי לה את הנוסח בקצרה, אלא אם כבר ביקשה במפורש "תכיני טיוטה".
- שינוי סטטוס של הזמנה/שריון/ליד — רק propose_admin_action. זה מציג לה כפתור אישור; השינוי קורה רק כשהיא לוחצת. לעולם אל תגידי "עדכנתי" על שינוי כזה.
- מזהים (id) קחי רק מתוצאות של כלים, לא לנחש.`;

const LEAD_STATUSES = ["new", "replied", "follow_up", "booked", "not_relevant"] as const;

export function buildAdminChatTools() {
  return {
    admin_snapshot: tool({
      description: "סקירה מהירה: שריונים היום והקרובים, הזמנות אחרונות, התראות שלא נקראו, לידים חדשים.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { getAdminVoiceSnapshot } = await import("./voice-admin.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [snap, leads] = await Promise.all([
            getAdminVoiceSnapshot(),
            (supabaseAdmin as any)
              .from("inquiry_leads")
              .select("id, name, topic, source, created_at")
              .eq("status", "new")
              .order("created_at", { ascending: false })
              .limit(5),
          ]);
          return { ...snap, newLeads: leads.data ?? [] };
        } catch (e) {
          console.error("[SWEETBABY] admin_snapshot failed", e);
          return { error: true };
        }
      },
    }),

    admin_find_customer: tool({
      description: "מחפש לקוחה לפי שם או טלפון בשריונים, הזמנות אביזרים והזמנות ניו-בורן ומחזיר פרטי קשר.",
      inputSchema: z.object({ query: z.string().min(2).max(60) }),
      execute: async ({ query }) => {
        try {
          const { lookupAdminCustomerContact } = await import("./voice-admin.server");
          return { matches: await lookupAdminCustomerContact(query) };
        } catch (e) {
          console.error("[SWEETBABY] admin_find_customer failed", e);
          return { error: true };
        }
      },
    }),

    admin_query_data: tool({
      description:
        "מריץ שאילתת SELECT אחת (קריאה בלבד) על מסד הנתונים של האתר ומחזיר שורות. לפני הקריאה הראשונה קראי admin_db_schema אם את לא בטוחה בשמות עמודות.",
      inputSchema: z.object({ sql: z.string().min(10).max(3000) }),
      execute: async ({ sql }) => {
        const q = sql.trim().replace(/;+\s*$/, "");
        if (!/^(select|with)\b/i.test(q) || /;/.test(q)) return { error: true, message: "רק SELECT אחד" };
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await (supabaseAdmin as any).rpc("run_readonly_query", { q });
          if (error) return { error: true, message: error.message };
          const rows = Array.isArray(data) ? data : [data];
          return { rowCount: rows.length, rows: rows.slice(0, 60) };
        } catch (e: any) {
          return { error: true, message: String(e?.message ?? e) };
        }
      },
    }),

    admin_db_schema: tool({
      description: "מחזיר את רשימת הטבלאות והעמודות של מסד הנתונים (לכתיבת שאילתה נכונה).",
      inputSchema: z.object({}),
      execute: async () => {
        const { ADMIN_DB_SCHEMA_HE } = await import("./admin-site-bot.functions");
        return { schema: ADMIN_DB_SCHEMA_HE };
      },
    }),

    gmail_search: tool({
      description:
        "מחפש מיילים (תחביר חיפוש של ג׳ימייל, למשל is:unread newer_than:3d, from:x). account = כתובת חשבון מחובר (ברירת מחדל: מייל הסטודיו s0548529277).",
      inputSchema: z.object({
        query: z.string().max(200),
        account: z.string().max(80).optional(),
        max: z.number().int().min(1).max(15).optional(),
      }),
      execute: async ({ query, account, max }) => {
        const g = await import("@/integrations/google/gmail.server");
        const acc = await g.resolveGmailAccount(account);
        if (!acc) {
          const all = await g.listGmailAccounts();
          return { error: true, message: "החשבון לא מחובר לאתר", connected: all.map((a) => a.email) };
        }
        const results = await g.searchGmail(query, max ?? 8, acc.connKey);
        return { account: acc.email, results };
      },
    }),

    gmail_read: tool({
      description: "קורא מייל מלא לפי id (מתוך gmail_search).",
      inputSchema: z.object({ id: z.string().max(40), account: z.string().max(80).optional() }),
      execute: async ({ id, account }) => {
        const g = await import("@/integrations/google/gmail.server");
        const acc = await g.resolveGmailAccount(account);
        if (!acc) return { error: true, message: "החשבון לא מחובר לאתר" };
        const body = await g.getGmailMessageBody(id, acc.connKey);
        return body ? { account: acc.email, body: body.slice(0, 6000) } : { error: true, message: "לא נמצא" };
      },
    }),

    gmail_create_draft: tool({
      description:
        "יוצר טיוטת מייל (לא שולח!) בחשבון המחובר. threadId — כדי שהטיוטה תהיה תשובה בתוך שיחה קיימת (מתוך gmail_search).",
      inputSchema: z.object({
        to: z.string().max(200),
        subject: z.string().max(200),
        text: z.string().min(2).max(6000),
        threadId: z.string().max(40).optional(),
        account: z.string().max(80).optional(),
      }),
      execute: async ({ to, subject, text, threadId, account }) => {
        const g = await import("@/integrations/google/gmail.server");
        const acc = await g.resolveGmailAccount(account);
        if (!acc) return { error: true, message: "החשבון לא מחובר לאתר" };
        const r = await g.createGmailDraft({ connKey: acc.connKey, fromEmail: acc.email, to, subject, text, threadId });
        return r.ok ? { ok: true, account: acc.email, note: "הטיוטה בתיקיית הטיוטות — לא נשלחה" } : r;
      },
    }),

    run_email_drafts_now: tool({
      description:
        "מריץ עכשיו את עוזר הטיוטות האוטומטי: עובר על מיילים חדשים שמחכים לתשובה ויוצר טיוטות מעוצבות בג׳ימייל (לא שולח). רץ גם לבד כל 20 דקות בשעות 8–22.",
      inputSchema: z.object({}),
      execute: async () => {
        const { runEmailDraftAssistant } = await import("./email-drafts.server");
        return runEmailDraftAssistant({ force: true });
      },
    }),

    propose_admin_action: tool({
      description:
        "מציע שינוי אחד ומציג למיכל כפתור אישור. kind: order_status / booking_status (status: pending/confirmed/active/returned/cancelled וכו'), lead_status (status: " +
        LEAD_STATUSES.join("/") +
        "). השינוי מתבצע רק אם היא לוחצת.",
      inputSchema: z.object({
        kind: z.enum(["order_status", "booking_status", "lead_status"]),
        id: z.string().uuid(),
        status: z.string().min(2).max(30),
        summary: z.string().max(160).describe("תיאור קצר בעברית של מה יקרה"),
      }),
      execute: async ({ kind, status }) => {
        if (kind === "lead_status" && !(LEAD_STATUSES as readonly string[]).includes(status))
          return { ok: false, message: "סטטוס ליד לא תקין" };
        return { ok: true, waitingForConfirmClick: true };
      },
    }),
  };
}
