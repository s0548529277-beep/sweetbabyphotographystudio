import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/** Emails are only visible to the studio admin (auth.users is not exposed to the client). */
export const listClientEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const map: Record<string, string> = {};
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of data.users) map[u.id] = u.email ?? "";
      if (data.users.length < 200) break;
    }
    return map;
  });

export const setClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), password: z.string().min(4).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateClientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        full_name: z.string().max(120).optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        address: z.string().max(200).optional().nullable(),
        city: z.string().max(80).optional().nullable(),
        discount_code: z.string().max(40).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { user_id, ...fields } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
