import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

// Routed through the same Lovable AI Gateway the customer-facing ChatBot
// already uses (see ai.functions.ts) — reuses the existing LOVABLE_API_KEY
// secret instead of requiring a separate ANTHROPIC_API_KEY to be added.
const AI_MODEL = "google/gemini-2.5-flash";

function aiGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY לא מוגדר ב-Supabase secrets");
  return createLovableAiGatewayProvider(key);
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

const REPO_OWNER = "s0548529277-beep";
const REPO_NAME = "sweetbabyphotographystudio";
const REPO = `${REPO_OWNER}/${REPO_NAME}`;

function githubHeaders() {
  const token = process.env.SITE_BOT_GITHUB_TOKEN;
  if (!token) throw new Error("SITE_BOT_GITHUB_TOKEN לא מוגדר ב-Supabase secrets");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    // GitHub's REST API rejects requests with no User-Agent (403
    // "Request forbidden by administrative rules") — the runtime's
    // built-in fetch doesn't set one by default.
    "User-Agent": "sweetbaby-site-bot",
  };
}

async function gh(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, { ...init, headers: { ...githubHeaders(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Asks the AI to rewrite one file's full contents per the admin's instruction. Returns the new file text and a one-line summary of what changed. */
async function askClaudeForFileEdit(currentContent: string, targetPath: string, instruction: string): Promise<{ newContent: string; summary: string }> {
  const gateway = aiGateway();

  const system = `אתה עורך קוד עבור אתר סטודיו צילום (React + TanStack Start + Tailwind, RTL בעברית). תפקידך: לקבל תוכן קובץ קיים ובקשת שינוי בעברית, ולהחזיר את הקובץ המלא אחרי השינוי — בלי לשבור קוד עובד.

כללים מחייבים:
- שמור על כל ה-imports, ה-exports, ומבנה ה-routing הקיים (createFileRoute וכו') אלא אם התבקש אחרת במפורש.
- שמור על עברית + RTL בכל טקסט חדש.
- שמור על סגנון העיצוב הקיים בקובץ (Tailwind classes, צבעים, מרווחים) — אם מוסיפים אלמנט חדש, שיתאים לסגנון הקיים ולא ייראה זר.
- אל תמחק פונקציונליות קיימת (טפסים, קריאות שרת, ולידציות) אלא אם התבקש מפורשות.
- אל תוסיף תלויות (imports) חדשות שלא קיימות כבר בפרויקט הזה.

החזר אך ורק JSON תקני בפורמט הבא, ללא טקסט נוסף, ללא markdown fences:
{"new_content": "<תוכן הקובץ המלא אחרי השינוי>", "summary": "<משפט אחד בעברית שמתאר מה השתנה בפועל>"}`;

  const user = `קובץ: ${targetPath}

תוכן נוכחי:
\`\`\`
${currentContent}
\`\`\`

בקשת השינוי: ${instruction}`;

  const { text } = await generateText({
    model: gateway(AI_MODEL),
    system,
    messages: [{ role: "user", content: user }],
  });

  let parsed: { new_content: string; summary: string };
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error("תשובת ה-AI לא הייתה JSON תקין — נסה לנסח את הבקשה אחרת");
  }
  if (!parsed.new_content) throw new Error("ה-AI לא החזיר תוכן קובץ");
  return { newContent: parsed.new_content, summary: parsed.summary || instruction };
}

/**
 * Proposes a change to one file: fetches its current content from `main`,
 * asks Claude to rewrite it per the instruction, opens a new branch + PR
 * with the result, and logs the request. Never touches main directly —
 * publishing is a separate, explicit `mergeSiteChange` call.
 */
export const proposeSiteChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        instruction: z.string().min(3, "צריך לתאר מה לשנות"),
        target_path: z.string().min(3, "צריך לציין נתיב קובץ"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: logRow } = await supabaseAdmin
      .from("site_bot_requests")
      .insert({ created_by: context.userId, instruction: data.instruction, target_path: data.target_path, status: "proposing" })
      .select("id")
      .single();
    const logId = logRow?.id;

    try {
      // 1. Current file content + sha (needed for the commit) straight from main.
      const fileRes = await gh(`/repos/${REPO}/contents/${encodeURIComponent(data.target_path)}?ref=main`);
      const currentContent = Buffer.from(fileRes.content, "base64").toString("utf-8");

      // 2. Ask Claude to rewrite it.
      const { newContent, summary } = await askClaudeForFileEdit(currentContent, data.target_path, data.instruction);
      if (newContent === currentContent) throw new Error("אין שינוי בפועל — נסה לנסח את הבקשה ביתר פירוט");

      // 3. Branch off latest main.
      const mainRef = await gh(`/repos/${REPO}/git/ref/heads/main`);
      const branchName = `site-bot/${Date.now()}`;
      await gh(`/repos/${REPO}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainRef.object.sha }),
      });

      // 4. Commit the new content to that branch.
      await gh(`/repos/${REPO}/contents/${encodeURIComponent(data.target_path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `site-bot: ${summary}`,
          content: Buffer.from(newContent, "utf-8").toString("base64"),
          sha: fileRes.sha,
          branch: branchName,
        }),
      });

      // 5. Open the PR.
      const pr = await gh(`/repos/${REPO}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title: `🤖 ${summary}`,
          head: branchName,
          base: "main",
          body: `**בקשה:** ${data.instruction}\n\n**קובץ:** \`${data.target_path}\`\n\nנוצר אוטומטית על-ידי בוט העריכה בדף הניהול. יש לסקור לפני אישור.`,
        }),
      });

      await supabaseAdmin
        .from("site_bot_requests")
        .update({ status: "proposed", branch_name: branchName, pr_number: pr.number, pr_url: pr.html_url, summary })
        .eq("id", logId);

      return { ok: true, pr_url: pr.html_url, summary };
    } catch (e: any) {
      await supabaseAdmin.from("site_bot_requests").update({ status: "failed", error: String(e?.message ?? e) }).eq("id", logId);
      throw new Error(e?.message ?? "השינוי נכשל");
    }
  });

/** Asks Claude to write a single read-only SELECT that answers the question, given a fixed summary of the schema. */
async function askClaudeForSql(question: string): Promise<string> {
  const gateway = aiGateway();

  const schema = `טבלאות רלוונטיות (סכמה ציבורית, PostgreSQL):
- orders(id, user_id, contact_name, total, credit_used_cashback, credit_used_manual, coupon_code, coupon_discount, balance_method, status, deposit_status, scheduled_date, created_at)
- bookings(id, user_id, contact_name, price, credit_used_cashback, credit_used_manual, coupon_code, coupon_discount, balance_method, package, status, session_date, created_at)
- expenses(id, title, amount, category, spent_on)
- manual_income(id, title, amount, category, notes, received_on)
- customer_loyalty(user_id, cashback_percent, cashback_credit_balance, manual_credit_balance, credit_balance, cashback_expires_at, updated_at)
- coupons(id, code, discount_percent, discount_amount, active, expires_at)
- items(id, name, category_id, price_per_day, active)
- profiles(id, full_name, phone, email)
- user_roles(user_id, role)

הערות חשובות:
- balance_method הערכים: 'cash','card','transfer','bit' (card = אשראי).
- הכנסה בפועל = orders.total + bookings.price של רשומות עם status != 'cancelled'.
- תאריכים מסוג date/timestamptz — להשתמש ב-date_trunc / >= / < לטווחי זמן ('חודש שעבר' וכו').`;

  const system = `אתה כותב שאילתות SQL קריאה-בלבד (SELECT/WITH) עבור מסד נתונים PostgreSQL של אתר סטודיו צילום, לפי שאלה בעברית מהמנהלת. ${schema}

כללים:
- אך ורק שאילתת SELECT/WITH אחת. אסור INSERT/UPDATE/DELETE/DROP/כל שינוי.
- אל תוסיף LIMIT — זה מתווסף אוטומטית.
- אל תמציא עמודות/טבלאות שלא ברשימה למעלה.
- החזר אך ורק JSON: {"sql": "<השאילתה>"}, בלי טקסט נוסף, בלי markdown fences.`;

  const { text } = await generateText({
    model: gateway(AI_MODEL),
    system,
    messages: [{ role: "user", content: question }],
  });

  let parsed: { sql: string };
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error("ה-AI לא החזיר שאילתה תקינה — נסה לנסח את השאלה אחרת");
  }
  if (!parsed.sql) throw new Error("ה-AI לא החזיר שאילתה");
  return parsed.sql;
}

/** Asks the AI to phrase the query result as a short Hebrew answer. */
async function askClaudeToSummarize(question: string, rows: unknown): Promise<string> {
  const gateway = aiGateway();
  const { text } = await generateText({
    model: gateway(AI_MODEL),
    system: "אתה עונה בעברית, בקצרה ובבירור, על שאלה של מנהלת סטודיו צילום, בהתבסס אך ורק על תוצאות ה-JSON שמצורפות. אם התוצאה ריקה, אמור זאת בפשטות. תמיד תן מספרים מדויקים (₪ בעברית), לא הערכות.",
    messages: [{ role: "user", content: `שאלה: ${question}\n\nתוצאות מה-DB (JSON):\n${JSON.stringify(rows).slice(0, 6000)}` }],
  });
  return text.trim();
}

/** Read-only Q&A over the site's data — never writes anything, enforced both by prompt and by DB-level role permissions (see run_readonly_query). */
export const askSiteData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ question: z.string().min(3, "צריך לשאול משהו") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let sql = "";
    try {
      sql = await askClaudeForSql(data.question);
      const { data: rows, error } = await supabaseAdmin.rpc("run_readonly_query", { q: sql });
      if (error) throw new Error(error.message);
      const answer = await askClaudeToSummarize(data.question, rows);

      await supabaseAdmin.from("site_bot_questions").insert({ created_by: context.userId, question: data.question, sql_used: sql, answer });
      return { ok: true, answer, sql };
    } catch (e: any) {
      await supabaseAdmin.from("site_bot_questions").insert({ created_by: context.userId, question: data.question, sql_used: sql || null, error: String(e?.message ?? e) });
      throw new Error(e?.message ?? "השאלה נכשלה");
    }
  });

export const listSiteQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await context.supabase.from("site_bot_questions").select("*").order("created_at", { ascending: false }).limit(30);
    return data ?? [];
  });

export const listSiteChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await context.supabase.from("site_bot_requests").select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

/** Publishes a proposed change: merges its PR into main and deletes the branch. */
export const mergeSiteChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("site_bot_requests").select("*").eq("id", data.id).maybeSingle();
    if (!row || row.status !== "proposed") throw new Error("אין שינוי ממתין לאישור עם המזהה הזה");

    await gh(`/repos/${REPO}/pulls/${row.pr_number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) });
    await gh(`/repos/${REPO}/git/refs/heads/${row.branch_name}`, { method: "DELETE" }).catch(() => {});
    await supabaseAdmin.from("site_bot_requests").update({ status: "merged", merged_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

/** Discards a proposed change: closes its PR and deletes the branch, without publishing anything. */
export const rejectSiteChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("site_bot_requests").select("*").eq("id", data.id).maybeSingle();
    if (!row || row.status !== "proposed") throw new Error("אין שינוי ממתין עם המזהה הזה");

    await gh(`/repos/${REPO}/pulls/${row.pr_number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) }).catch(() => {});
    await gh(`/repos/${REPO}/git/refs/heads/${row.branch_name}`, { method: "DELETE" }).catch(() => {});
    await supabaseAdmin.from("site_bot_requests").update({ status: "rejected" }).eq("id", data.id);
    return { ok: true };
  });
