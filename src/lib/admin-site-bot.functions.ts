import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateTextResilient } from "./ai-gateway.server";

// Every AI call in this file (both the read-only "ask about the data" bot
// and the code-EDITING bot below) now goes through generateTextResilient —
// the same Gemini → Groq → Lovable fallback chain the customer-facing bots
// use — instead of Lovable alone (see git history: this used to be
// Lovable-only, which meant this admin tool broke every time the Lovable
// AI Gateway ran out of credits, same as the customer bot did before
// tonight's fix). A whole-file rewrite can be a genuinely large response,
// so it's given a longer budget (60s) than the default; this is a
// background admin action (posts a PR, no one is on hold waiting on a live
// call), so the extra time is cheap and safe.
const FILE_EDIT_TIMEOUT_MS = 60_000;

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

  const { text } = await generateTextResilient({ system, messages: [{ role: "user", content: user }] }, FILE_EDIT_TIMEOUT_MS);

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

    const { data: logRow, error: logErr } = await supabaseAdmin
      .from("site_bot_requests")
      .insert({
        created_by: context.userId,
        instruction: data.instruction,
        target_path: data.target_path,
        status: "proposing",
        messages: [{ role: "user", text: data.instruction }],
      })
      .select("id")
      .single();
    // Fail loudly instead of silently continuing with a broken logId — a
    // request that isn't logged can still succeed on GitHub's side (branch
    // + PR created) while never showing up in the "history" list below,
    // which looks like nothing happened at all.
    if (logErr || !logRow) throw new Error(`לא ניתן היה לתעד את הבקשה: ${logErr?.message ?? "unknown error"}`);
    const logId = logRow.id;

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

      const { error: doneErr } = await supabaseAdmin
        .from("site_bot_requests")
        .update({
          status: "proposed",
          branch_name: branchName,
          pr_number: pr.number,
          pr_url: pr.html_url,
          summary,
          messages: [{ role: "user", text: data.instruction }, { role: "bot", text: summary }],
        })
        .eq("id", logId);
      // The PR is already live on GitHub at this point — if the log update
      // itself fails, still tell the admin (rather than a false "success"
      // toast for a request that won't show up in the history list), but
      // point her straight at the PR since the actual work is done.
      if (doneErr) throw new Error(`הטיוטה נוצרה בגיטהאב (${pr.html_url}) אך עדכון הרשומה נכשל: ${doneErr.message}`);

      return { ok: true, id: logId, pr_url: pr.html_url, summary };
    } catch (e: any) {
      await supabaseAdmin
        .from("site_bot_requests")
        .update({
          status: "failed",
          error: String(e?.message ?? e),
          messages: [{ role: "user", text: data.instruction }, { role: "bot", text: `שגיאה: ${String(e?.message ?? e)}` }],
        })
        .eq("id", logId);
      throw new Error(e?.message ?? "השינוי נכשל");
    }
  });

/**
 * Continues an open draft's conversation: takes the file as it currently
 * stands on the draft's own branch (not main), asks Claude to revise it per
 * a follow-up instruction, and pushes another commit to that SAME branch —
 * so a multi-turn "still not right, make it X" conversation refines one PR
 * instead of spawning a new one per message.
 */
export const reviseSiteChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), instruction: z.string().min(2, "צריך לתאר מה לשנות") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: rowErr } = await supabaseAdmin.from("site_bot_requests").select("*").eq("id", data.id).maybeSingle();
    if (rowErr || !row) throw new Error("הבקשה לא נמצאה");
    if (row.status !== "proposed" || !row.branch_name) throw new Error("אפשר להמשיך שיחה רק על טיוטה שממתינה לאישור");

    const priorMessages = Array.isArray((row as any).messages) ? (row as any).messages : [];
    const userTurn = { role: "user", text: data.instruction };

    try {
      // Read the branch's current version of the file — not main — so this
      // builds on whatever the last turn already changed.
      const fileRes = await gh(`/repos/${REPO}/contents/${encodeURIComponent(row.target_path)}?ref=${row.branch_name}`);
      const currentContent = Buffer.from(fileRes.content, "base64").toString("utf-8");

      const { newContent, summary } = await askClaudeForFileEdit(currentContent, row.target_path, data.instruction);
      if (newContent === currentContent) throw new Error("אין שינוי בפועל — נסה לנסח את הבקשה ביתר פירוט");

      await gh(`/repos/${REPO}/contents/${encodeURIComponent(row.target_path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `site-bot: ${summary}`,
          content: Buffer.from(newContent, "utf-8").toString("base64"),
          sha: fileRes.sha,
          branch: row.branch_name,
        }),
      });

      const { error: doneErr } = await supabaseAdmin
        .from("site_bot_requests")
        .update({ summary, messages: [...priorMessages, userTurn, { role: "bot", text: summary }] })
        .eq("id", data.id);
      if (doneErr) throw new Error(`השינוי נדחף לגיטהאב אך עדכון הרשומה נכשל: ${doneErr.message}`);

      return { ok: true, summary };
    } catch (e: any) {
      const errText = String(e?.message ?? e);
      await supabaseAdmin
        .from("site_bot_requests")
        .update({ messages: [...priorMessages, userTurn, { role: "bot", text: `שגיאה: ${errText}` }] })
        .eq("id", data.id);
      throw new Error(errText);
    }
  });

/** Fetches the unified diff GitHub already computed for this draft's PR, so the admin can see exactly what changed before approving — no separate preview deployment needed. */
/**
 * Translates a raw code diff into a plain-Hebrew description of what a site
 * visitor would actually SEE differently — not a real rendered preview (this
 * project has no per-branch preview deployment to point at), but the
 * closest thing achievable without one: "מה ישתנה בעין" instead of +/- lines
 * of code an admin who doesn't read code can't judge.
 */
async function describeVisibleChange(patch: string, targetPath: string): Promise<string> {
  if (!patch) return "";
  const { text } = await generateTextResilient({
    system: `את מסבירה למנהלת סטודיו צילום שלא קוראת קוד מה בדיוק ישתנה למי שיבקר באתר, על סמך diff של קובץ. תתמקדי אך ורק במה שרואים: טקסט/מילים שהשתנו (תני ציטוט "היה" → "יהיה"), אלמנטים שנוספו/הוסרו, שינויי עיצוב מורגשים (צבע, גודל, מרווח, מיקום). אל תסבירי קוד, שמות משתנים, לוגיקה טכנית, או דברים שלא משפיעים על מה שרואים בעין. אם השינוי טכני לגמרי בלי השפעה נראית לעין (תיקון קוד פנימי, לוגיקה) — תגידי את זה במפורש בפשטות. תשובה קצרה, נקודות ברורות, בלי מבוא.`,
    messages: [{ role: "user", content: `קובץ: ${targetPath}\n\ndiff:\n${patch.slice(0, 8000)}` }],
  });
  return text.trim();
}

export const getSiteChangeDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("site_bot_requests").select("pr_number, target_path").eq("id", data.id).maybeSingle();
    if (!row?.pr_number) throw new Error("אין עדיין טיוטה בגיטהאב לבקשה הזו");

    const files = await gh(`/repos/${REPO}/pulls/${row.pr_number}/files`);
    const file = (files as any[]).find((f) => f.filename === row.target_path) ?? files[0];
    // GitHub omits `patch` for very large diffs/files — no way around that
    // short of diffing the raw blobs ourselves, so the UI falls back to a
    // "view on GitHub" link in that case.
    const patch = file?.patch ?? "";
    let plainSummary = "";
    try {
      plainSummary = await describeVisibleChange(patch, file?.filename ?? row.target_path);
    } catch (e) {
      console.error("[SWEETBABY] plain-language diff summary failed", e);
    }
    return { patch, plainSummary, filename: file?.filename ?? row.target_path, additions: file?.additions ?? 0, deletions: file?.deletions ?? 0 };
  });

/**
 * Reverts an already-published change: asks GitHub to open a new PR that
 * undoes the merged PR's commit, then logs it as a normal new request
 * (status "proposed") so it goes through the exact same explicit
 * approve/reject review as any other change — reverting never touches
 * main directly either.
 */
export const revertSiteChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("site_bot_requests").select("*").eq("id", data.id).maybeSingle();
    if (!row || row.status !== "merged" || !row.pr_number) throw new Error("אפשר להחזיר רק שינוי שכבר פורסם");

    const revertPr = await gh(`/repos/${REPO}/pulls/${row.pr_number}/revert`, { method: "POST" });
    const label = (row as any).summary || (row as any).instruction;

    const { data: logRow, error: logErr } = await supabaseAdmin
      .from("site_bot_requests")
      .insert({
        created_by: context.userId,
        instruction: `החזרה למצב שלפני: ${label}`,
        target_path: (row as any).target_path,
        status: "proposed",
        branch_name: revertPr.head?.ref ?? null,
        pr_number: revertPr.number,
        pr_url: revertPr.html_url,
        summary: `ביטול "${label}"`,
        messages: [{ role: "bot", text: `נוצרה טיוטת החזרה למצב שלפני "${label}". אפשר לסקור ולאשר כמו כל טיוטה אחרת.` }],
      })
      .select("id")
      .single();
    if (logErr || !logRow) throw new Error(`טיוטת ההחזרה נוצרה בגיטהאב (${revertPr.html_url}) אך עדכון הרשומה נכשל: ${logErr?.message}`);

    return { ok: true, id: logRow.id, pr_url: revertPr.html_url };
  });

type ChatTurn = { question: string; answer: string };

function historyBlock(history: ChatTurn[]): string {
  if (!history.length) return "";
  return `\n\nהיסטוריית השיחה עד כה (לצורך הקשר בלבד — אם השאלה הנוכחית היא המשך/מתייחסת ל"זה", "אותו דבר", "וגם", "ומה לגבי" וכו', הכוונה להקשר הזה):\n${history
    .map((h, i) => `${i + 1}. ש: ${h.question}\n   ת: ${h.answer}`)
    .join("\n")}`;
}

/** Asks Claude to write a single read-only SELECT that answers the question, given a fixed summary of the schema and the recent conversation for context. */
async function askClaudeForSql(question: string, history: ChatTurn[]): Promise<string | null> {
  const schema = `טבלאות רלוונטיות (סכמה ציבורית, PostgreSQL) — הרשימה המלאה, אל תניחי עמודות שלא מפורטות כאן:

- orders — הזמנות אביזרים (props). id, user_id, track, status ('pending'/'confirmed'/'active'/'returned'/'cancelled'), total, deposit_amount, balance_amount, deposit_status, balance_method ('cash'/'card'/'transfer'/'bit'), coupon_code, coupon_discount, credit_used_cashback, credit_used_manual, contact_name, contact_phone, camera_model, session_date, scheduled_date, return_date, pickup_at, return_at, notes, google_event_id, terms_accepted_at, created_at, updated_at.
- order_items — שורות פריטים בתוך הזמנת אביזרים. id, order_id, item_id, item_name, item_sku, quantity, price, created_at.
- bookings — הזמנות/שריוני סטודיו. id, user_id, status, package ('regular'/'morning'), slots, start_time, end_time, session_date, price, deposit_amount, balance_amount, deposit_status, balance_method, coupon_code, coupon_discount, credit_used_cashback, credit_used_manual, contact_name, contact_phone, reserved_items (jsonb — מק"טי אביזרים ששוריינו יחד עם הסטודיו), subscription_pass_id, google_event_id, notes, terms_accepted_at, created_at, updated_at.
- items — קטלוג אביזרים להשכרה. id, sku, name, description, price, image_url, category_id, active, stock_quantity, sort_order, created_at, updated_at.
- categories — קטגוריות אביזרים. id, name, slug, sort_order, created_at.
- coupons — קופונים. id, code, discount_percent, discount_amount, active, expires_at, single_use (בוליאני — קוד אישי חד-פעמי), redeemed_at, issued_to_email, newsletter_default (בוליאני — הקופון שמוצג בטופס ההרשמה לניוזלטר).
- customer_loyalty — מועדון קאשבק. user_id, cashback_percent, cashback_expires_at, cashback_credit_balance, manual_credit_balance, credit_balance (= סכום שתי הקודמות), updated_at.
- expenses — הוצאות. id, title, amount, category, notes, spent_on, created_at.
- manual_income — הכנסות ידניות (לא הזמנות/שריונים). id, title, amount, category, notes, received_on, created_at.
- newsletter_signups — נרשמות לניוזלטר בפוטר. id, email, source, created_at.
- subscription_plans — תבניות חבילות מנוי (למשל "SWEET 10+1"). id, name, total_entries, price, active, created_at.
- subscription_passes — כרטיסיות מנוי שנרכשו בפועל ע"י לקוחות. id, user_id, plan_id, plan_name, total_entries, entries_used, price_paid, status ('active'/'cancelled'), notes, purchased_at.
- profiles — פרטי לקוחות (לא כולל אימייל — אימייל נמצא בטבלת auth.users הפנימית שאינה נגישה כאן; לשאלות שדורשות אימייל, ענה שהמידע הזה לא זמין בשאילתה). id (= user_id), full_name, phone, address, city, discount_code, notes, created_at, updated_at.
- user_roles — הרשאות. user_id, role ('admin' וכו').
- leads — פניות מטופס יצירת קשר/עניין באתר. id, user_id, email, full_name, phone, referral_source (איך שמעו עלינו), created_at.
- subscription_requests — בקשות עניין ישנות במנוי (לפני שהיה ניהול כרטיסיות מלא). id, user_id, full_name, phone, email, plan, notes, status ('pending' וכו'), created_at.
- studio_closures — ימים סגורים/שעות מיוחדות בסטודיו. id, date, closed (בוליאני), open_time, close_time, note.

הערות חשובות:
- הכנסה בפועל = orders.total + bookings.price של רשומות עם status != 'cancelled'.
- "לקוחות" = טבלת profiles (JOIN לפי id = user_id בטבלאות אחרות).
- תאריכים מסוג date/timestamptz — להשתמש ב-date_trunc / >= / < לטווחי זמן ('חודש שעבר' וכו').
- אם השאלה דורשת אימייל של לקוח/ה — אין לך גישה לזה, ציין זאת בתשובה במקום להמציא עמודה.`;

  const system = `אתה כותב שאילתות SQL קריאה-בלבד (SELECT/WITH) עבור מסד נתונים PostgreSQL של אתר סטודיו צילום, לפי שאלה בעברית מהמנהלת. ${schema}

כללים:
- אך ורק שאילתת SELECT/WITH אחת. אסור INSERT/UPDATE/DELETE/DROP/כל שינוי.
- אל תוסיף LIMIT — זה מתווסף אוטומטית.
- אל תמציא עמודות/טבלאות שלא ברשימה למעלה.
- אם השאלה היא לא שאלה על הנתונים בכלל — שיחת חולין, ברכה, "תודה", "מה נשמע", בקשה לעזרה כללית וכו' — אל תמציא שאילתה מלאכותית. החזירי {"sql": null}.
- אחרת החזירי אך ורק JSON: {"sql": "<השאילתה>"}, בלי טקסט נוסף, בלי markdown fences.`;

  const { text } = await generateTextResilient({
    system,
    messages: [{ role: "user", content: question + historyBlock(history) }],
  });

  let parsed: { sql: string | null };
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error("ה-AI לא החזיר שאילתה תקינה — נסה לנסח את השאלה אחרת");
  }
  return parsed.sql || null;
}

const CHAT_PERSONA =
  "את העוזרת האישית של מיכל, מנהלת סטודיו הצילום סוויט בייבי — לא בוט יבש, אלא קולגה חמה, נעימה וחכמה שבאמת עוזרת. עני בעברית, בטון קליל, אישי וידידותי, אבל תמיד מדויקת ואמינה.";

/** Asks the AI to phrase the query result as a short Hebrew answer, as a reply in an ongoing chat (not a one-off). */
async function askClaudeToSummarize(question: string, rows: unknown, history: ChatTurn[]): Promise<string> {
  const { text } = await generateTextResilient({
    system: `${CHAT_PERSONA} עני על שאלה של מיכל בהתבסס אך ורק על תוצאות ה-JSON שמצורפות — לעולם אל תמציאי או תעריכי מספר שלא נמצא שם. תמיד תני מספרים מדויקים (₪ בעברית). זו שיחת צ'אט מתמשכת, לא שאלה בודדת — אפשר ורצוי להתייחס לדברים שנאמרו קודם בשיחה ("כמו ששאלת קודם...", "בהמשך לזה..."). אם יש בתוצאה משהו שכדאי להבליט (מגמה בולטת, חריגה) אפשר להוסיף משפט קצר על זה — אבל רק אם זה נתמך ישירות בנתונים. אם התוצאה ריקה, אמרי זאת בפשטות ובנעימות, לא בהתנצלות יבשה.`,
    messages: [{ role: "user", content: `שאלה: ${question}${historyBlock(history)}\n\nתוצאות מה-DB עבור השאלה הנוכחית (JSON):\n${JSON.stringify(rows).slice(0, 6000)}` }],
  });
  return text.trim();
}

/** Handles a message that isn't actually a data question (greeting, thanks, small talk) — warm and human, without touching the DB. */
async function askClaudeSmallTalk(question: string, history: ChatTurn[]): Promise<string> {
  const { text } = await generateTextResilient({
    system: `${CHAT_PERSONA} ההודעה הזו לא שאלה על נתוני הסטודיו — ענה לה בטבעיות (ברכה, תודה, שיחת חולין קצרה), ואם רלוונטי הזכירי בעדינות שאת יכולה גם לענות על שאלות עם מספרים אמיתיים מהעסק (הזמנות, הכנסות, לקוחות וכו'). קצר, חם, בלי להישמע רובוטי.`,
    messages: [{ role: "user", content: question + historyBlock(history) }],
  });
  return text.trim();
}

/**
 * Read-only Q&A over the site's data — never writes anything, enforced both
 * by prompt and by DB-level role permissions (see run_readonly_query). The
 * client passes the last few turns as `history` so this behaves like an
 * actual chat (follow-ups like "ומה לגבי החודש הקודם") instead of a bot with
 * no memory between questions.
 */
export const askSiteData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        question: z.string().min(3, "צריך לשאול משהו"),
        history: z.array(z.object({ question: z.string(), answer: z.string() })).max(8).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const history = data.history ?? [];

    let sql = "";
    try {
      const generatedSql = await askClaudeForSql(data.question, history);
      let answer: string;
      if (!generatedSql) {
        // Not actually a data question (greeting, thanks, chit-chat) — no
        // need to hit the DB at all.
        answer = await askClaudeSmallTalk(data.question, history);
      } else {
        sql = generatedSql;
        const { data: rows, error } = await supabaseAdmin.rpc("run_readonly_query", { q: sql });
        if (error) throw new Error(error.message);
        answer = await askClaudeToSummarize(data.question, rows, history);
      }

      await supabaseAdmin.from("site_bot_questions").insert({ created_by: context.userId, question: data.question, sql_used: sql || null, answer });
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
    const { data, error } = await context.supabase.from("site_bot_questions").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listSiteChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("site_bot_requests").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
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
