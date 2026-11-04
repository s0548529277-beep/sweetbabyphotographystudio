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

מצב ניהול: את מדברת עכשיו עם מיכל, בעלת הסטודיו (מנהלת מאומתת), לא עם לקוחה. פני אליה בגובה העיניים, קצר ומעשי. התעלמי מהודעות פתיחה קודמות בשיחה שנכתבו ללקוחות. אם היא שואלת אם את במצב ניהול — עני "כן מיכל, אני במצב ניהול 👑" ופרטי בקצרה מה אפשר: נתונים, לידים, מיילים וטיוטות, שינויי סטטוס.
- נתונים (הזמנות, הכנסות, לידים, לקוחות, ניו-בורן): admin_snapshot לסקירה מהירה; לכל שאלה אחרת — admin_query_data עם SELECT אחד. לידים ופניות נמצאים בטבלה inquiry_leads (לא leads). לעולם אל תמציאי מספר. אם שאילתה נכשלה פעם אחת — אל תנסי שוב ושוב; עני במה שיש או אמרי שלא הצלחת.
- לידים: newLeads ב-admin_snapshot הם רק ה-5 האחרונים; המספר האמיתי הוא newLeadsTotal — תמיד צייני אותו ("51 חדשים, הנה 5 האחרונים"). "לא נענו" = לידים בסטטוס new; לרשימה מלאה/ישנה השתמשי ב-admin_query_data.
- "ממתינה למקדמה" = deposit_status (pending / cash_pending), לא status של ההזמנה (הזמנה יכולה להיות confirmed והמקדמה עדיין ממתינה). אל תערבבי ביניהם בספירה.
- "השבוע" / "בשבוע האחרון" = 7 הימים האחרונים כולל היום (לא שבוע קלנדרי); אמרי את טווח התאריכים שהשתמשת בו.
- תאריכים: היום והיום בשבוע מופיעים בתחילת ההוראות — אל תנחשי יום בשבוע; "מחר" = היום + 1. הזמנה שמתחילה מחר לא "להיום".
- טיוטות מייל: admin_snapshot מחזיר גם draftsStatus — מתי רצה הבדיקה האחרונה, כמה טיוטות הוכנו ואם היו תקלות. כשהיא שואלת על טיוטות, עני לפי זה.
- שאלה על לקוחה ספציפית ("מה יש לפרימי", "מה הזמינה X", "מה הסטטוס של Y"): קראי פעם אחת ל-admin_get_client_summary עם השם או הטלפון — היא מחזירה בבת אחת שריונים, הזמנות אביזרים (כולל הפריטים), ניו-בורן ופניות. אל תריצי בנוסף admin_query_data או admin_db_schema על אותה שאלה.
- עגלת קניות של לקוחה: האתר שומר עותק של העגלה של כל לקוחה מחוברת/אורחת (customer_carts). "מה יש בעגלה של X" → admin_get_client_summary (שדה carts); "מי השאירה עגלה / אילו עגלות יש" → admin_list_carts. אם carts ריק — עני שעדיין אין עגלה שמורה (לקוחה שגלשה בלי להתחבר, או שעוד לא הוסיפה כלום; עגלות שנוצרו לפני ההפעלה לא נשמרו), והציעי לבדוק הזמנות פתוחות. אל תחפשי עוד.
- חיפוש שלא החזיר תוצאה: מקסימום שני ניסיונות בסך הכול בשאלה אחת. אחרי זה עני במה שיש או אמרי "לא נמצא", בלי להמשיך לנסות.
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
          const [snap, leads, drafts, leadsCount] = await Promise.all([
            getAdminVoiceSnapshot(),
            (supabaseAdmin as any)
              .from("inquiry_leads")
              .select("id, name, topic, source, created_at")
              .eq("status", "new")
              .order("created_at", { ascending: false })
              .limit(5),
            (supabaseAdmin as any).from("app_settings").select("value").eq("key", "email_drafts_status").maybeSingle(),
            (supabaseAdmin as any).from("inquiry_leads").select("id", { count: "exact", head: true }).eq("status", "new"),
          ]);
          let draftsStatus: unknown = null;
          try {
            draftsStatus = drafts?.data?.value ? JSON.parse(drafts.data.value) : null;
          } catch {
            draftsStatus = null;
          }
          return {
            ...snap,
            newLeads: leads.data ?? [],
            // newLeads is only the latest 5 — this is the real total (the bot used to report "5 new leads" when 51 were waiting)
            newLeadsTotal: leadsCount?.count ?? null,
            draftsStatus,
          };
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

    admin_get_client_summary: tool({
      description:
        "תמונה מלאה של לקוחה אחת בקריאה אחת: שריוני סטודיו, הזמנות אביזרים (עם הפריטים), הזמנות ניו-בורן ופניות/לידים — לפי שם או טלפון. עגלה שלא נשלחה לא קיימת במסד.",
      inputSchema: z.object({ query: z.string().min(2).max(60) }),
      execute: async ({ query }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const q = query.trim().replace(/[%,()]/g, " ").trim();
          const digits = q.replace(/\D/g, "");
          const byPhone = digits.length >= 4;
          const none = Promise.resolve({ data: [] as any[] });
          // A failed query must not look like "nothing found" — remember the first error and report it.
          let queryError: string | null = null;
          const pick = (name: Promise<any>, phone: Promise<any>) =>
            Promise.all([name, phone]).then(([a, b]) => {
              if (!queryError && (a?.error || b?.error)) queryError = String((a?.error ?? b?.error)?.message ?? "query failed");
              const seen = new Set<string>();
              return [...(a.data ?? []), ...(b.data ?? [])].filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
            });
          const latest = (t: string, cols: string, nameCol: string, phoneCol: string) =>
            pick(
              db.from(t).select(cols).ilike(nameCol, `%${q}%`).order("created_at", { ascending: false }).limit(5),
              byPhone ? db.from(t).select(cols).ilike(phoneCol, `%${digits}%`).order("created_at", { ascending: false }).limit(5) : none,
            );
          const [bookings, orders, newborn, leads] = await Promise.all([
            latest("bookings", "id, user_id, status, package, session_date, start_time, end_time, price, deposit_status, contact_name, contact_phone, created_at", "contact_name", "contact_phone"),
            latest("orders", "id, user_id, status, total, deposit_status, session_date, scheduled_date, return_date, contact_name, contact_phone, created_at", "contact_name", "contact_phone"),
            latest("newborn_package_orders", "id, session_date, total_price, amount_paid, contact_name, contact_phone, contact_email, created_at", "contact_name", "contact_phone"),
            latest("inquiry_leads", "id, name, email, phone, topic, status, last_contact_at, created_at", "name", "phone"),
          ]);
          if (queryError) return { error: true, message: queryError };
          // The customer's cart (mirrored from her browser): find her user ids via profile, bookings and orders.
          const [profByName, profByPhone] = await Promise.all([
            db.from("profiles").select("id, full_name, phone").ilike("full_name", `%${q}%`).limit(5),
            byPhone ? db.from("profiles").select("id, full_name, phone").ilike("phone", `%${digits}%`).limit(5) : none,
          ]);
          const profiles = [...(profByName.data ?? []), ...(profByPhone.data ?? [])];
          const userIds = Array.from(
            new Set(
              [...profiles.map((p: any) => p.id), ...bookings.map((b: any) => b.user_id), ...orders.map((o: any) => o.user_id)].filter(Boolean),
            ),
          ) as string[];
          const cartsRes = userIds.length
            ? await db.from("customer_carts").select("user_id, lines, item_count, subtotal, updated_at").in("user_id", userIds)
            : { data: [] };
          const nameByUser = new Map<string, string>(profiles.map((p: any) => [p.id, p.full_name]));
          const carts = (cartsRes.data ?? []).map((c: any) => ({
            customer: nameByUser.get(c.user_id) ?? q,
            items: (c.lines ?? []).map((l: any) => ({ name: l.name, sku: l.sku, qty: l.quantity, price: l.price })),
            itemCount: c.item_count,
            subtotal: c.subtotal,
            lastChange: c.updated_at,
          }));
          const orderIds = orders.map((o: any) => o.id);
          const itemsRes = orderIds.length
            ? await db.from("order_items").select("order_id, item_name, quantity, price").in("order_id", orderIds)
            : { data: [] };
          if (itemsRes.error) return { error: true, message: String(itemsRes.error.message ?? "items query failed") };
          const itemsByOrder = new Map<string, any[]>();
          for (const it of itemsRes.data ?? []) {
            const arr = itemsByOrder.get(it.order_id) ?? [];
            arr.push({ item: it.item_name, qty: it.quantity, price: it.price });
            itemsByOrder.set(it.order_id, arr);
          }
          return {
            query,
            bookings,
            orders: orders.map((o: any) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })),
            newbornOrders: newborn,
            leads,
            carts,
            found: bookings.length + orders.length + newborn.length + leads.length + carts.length > 0,
            note: "carts = עגלת הקניות של הלקוחה כפי שנשמרה באתר מאז ההפעלה (רק לקוחה מחוברת או אורחת; מי שגלשה בלי חיבור לא נשמרת). אם carts ריק — עדיין אין עגלה שמורה.",
          };
        } catch (e: any) {
          console.error("[SWEETBABY] admin_get_client_summary failed", e);
          return { error: true, message: String(e?.message ?? e) };
        }
      },
    }),

    admin_list_carts: tool({
      description:
        "רשימת עגלות הקניות האחרונות של לקוחות באתר (מה כל אחת הוסיפה ועוד לא הזמינה): שם, פריטים, סכום ומתי השתנתה. לשאלות כמו 'מי השאירה עגלה' או 'מה יש בעגלות'.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      execute: async ({ limit }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const { data, error } = await db
            .from("customer_carts")
            .select("user_id, lines, item_count, subtotal, updated_at")
            .order("updated_at", { ascending: false })
            .limit(limit ?? 10);
          if (error) return { error: true, message: error.message };
          const ids = (data ?? []).map((c: any) => c.user_id);
          const profs = ids.length ? await db.from("profiles").select("id, full_name, phone").in("id", ids) : { data: [] };
          const prof = new Map<string, any>((profs.data ?? []).map((p: any) => [p.id, p]));
          // Guests have no profile: take the name/phone from their bookings and orders instead.
          const [bk, od] = ids.length
            ? await Promise.all([
                db.from("bookings").select("user_id, contact_name, contact_phone").in("user_id", ids).order("created_at", { ascending: false }).limit(60),
                db.from("orders").select("user_id, contact_name, contact_phone").in("user_id", ids).order("created_at", { ascending: false }).limit(60),
              ])
            : [{ data: [] }, { data: [] }];
          const contact = new Map<string, { name: string | null; phone: string | null }>();
          for (const r of [...(bk.data ?? []), ...(od.data ?? [])]) {
            if (!r.user_id || contact.has(r.user_id) || !(r.contact_name || r.contact_phone)) continue;
            contact.set(r.user_id, { name: r.contact_name ?? null, phone: r.contact_phone ?? null });
          }
          return {
            count: (data ?? []).length,
            carts: (data ?? []).map((c: any) => ({
              customer: prof.get(c.user_id)?.full_name || contact.get(c.user_id)?.name || "אורחת (עוד בלי שם — לא הזמינה)",
              phone: prof.get(c.user_id)?.phone ?? contact.get(c.user_id)?.phone ?? null,
              items: (c.lines ?? []).map((l: any) => `${l.name} ×${l.quantity}`),
              subtotal: c.subtotal,
              lastChange: c.updated_at,
            })),
          };
        } catch (e: any) {
          return { error: true, message: String(e?.message ?? e) };
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
          const { wrapReadonlySql } = await import("./readonly-sql");
          const { data, error } = await (supabaseAdmin as any).rpc("run_readonly_query", { q: wrapReadonlySql(q) });
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
        "מריץ עכשיו את עוזר הטיוטות האוטומטי: עובר על מיילים חדשים שמחכים לתשובה ויוצר טיוטות מעוצבות בג׳ימייל (לא שולח). רץ גם לבד בערך כל 10 דקות בין 7:30 ל-23:50 (לא בשבת).",
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
