// Server functions for /admin/email-design (see email-design.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMAIL_DESIGN_KEY, sanitizeEmailDesign, type EmailDesign } from "@/lib/email-design";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

export const getEmailDesign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailDesign> => {
    await assertAdmin(context.supabase, context.userId);
    const { readEmailDesign } = await import("@/lib/email-design.server");
    return readEmailDesign(true);
  });

export const setEmailDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ design: z.record(z.any()) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const clean = sanitizeEmailDesign(data.design);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert({ key: EMAIL_DESIGN_KEY, value: JSON.stringify(clean), updated_at: new Date().toISOString() });
    if (error) throw new Error("השמירה נכשלה");
    const { resetEmailDesignCache } = await import("@/lib/email-design.server");
    resetEmailDesignCache();
    return { ok: true, design: clean };
  });

/** Admin button: creates an EMPTY reply draft in Michal's Gmail ("היי," + room to write, wordmark on top, rotating photos, signature, buttons). */
export const createMichalBlankDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const g = await import("@/integrations/google/gmail.server");
    const { buildDraftHtml, buildDraftText } = await import("@/lib/email-draft-design");
    const acc = (await g.resolveGmailAccount("m0548529277@gmail.com")) ?? (await g.resolveGmailAccount());
    if (!acc) throw new Error("חשבון Gmail לא מחובר");
    const slideshow = `<div style="text-align:center;margin:18px 0 6px;line-height:0"><img src="https://sweetbabyphoto.shop/email/michal-photos.gif" alt="" width="480" style="width:100%;max-width:480px;height:auto;border:0;border-radius:14px;display:inline-block"></div>`;
    const html = buildDraftHtml({ brand: "photographer", body: "היי,", extraHtml: `<p style="margin:0 0 70px">&nbsp;</p>${slideshow}` });
    const id = await g.createGmailHtmlDraft({
      connKey: acc.connKey,
      fromEmail: acc.email,
      fromName: "מיכל סיבוני",
      to: "",
      subject: "",
      html,
      text: buildDraftText({ brand: "photographer", body: "היי," }),
    });
    if (!id) throw new Error("יצירת הטיוטה נכשלה");
    return { ok: true as const, id };
  });
