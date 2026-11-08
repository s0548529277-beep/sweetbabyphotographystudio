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
