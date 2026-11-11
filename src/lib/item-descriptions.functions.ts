// Public read + admin write of the "show item descriptions" switch (see item-descriptions.server.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public: are descriptions shown on the site? Failure = shown. */
export const getShowItemDescriptions = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
  const { readShowItemDescriptions } = await import("./item-descriptions.server");
  return readShowItemDescriptions();
});

export const setShowItemDescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ show: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { SHOW_ITEM_DESCRIPTIONS_KEY } = await import("./item-descriptions.server");
    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert({ key: SHOW_ITEM_DESCRIPTIONS_KEY, value: data.show ? "1" : "0", updated_at: new Date().toISOString() });
    if (error) throw new Error("השמירה נכשלה");
    return { ok: true, show: data.show };
  });
