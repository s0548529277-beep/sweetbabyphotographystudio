import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** Asks Claude to rewrite one file's full contents per the admin's instruction. Returns the new file text and a one-line summary of what changed. */
async function askClaudeForFileEdit(currentContent: string, targetPath: string, instruction: string): Promise<{ newContent: string; summary: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY לא מוגדר ב-Supabase secrets");

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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content ?? []).map((b: any) => b.text ?? "").join("");
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
