// Admin-editable newborn package list — ported as-is (same table/field
// names: package_types → newborn_package_types, name/price/description/
// sort_order/active) from the photographer-portal project's
// settings.functions.ts, per explicit request to compare it against the
// existing hardcoded NEWBORN_PACKAGES array (src/lib/newborn-packages.ts).
// Nothing here is wired into order creation — this is purely the
// admin-editable list itself, for her to look at and decide if it's an
// improvement.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

export const listNewbornPackageTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("newborn_package_types")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const packageInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  description: z.string().optional(),
  sort_order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const saveNewbornPackageType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => packageInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...fields } = data;
    if (id) {
      const { data: updated, error } = await (context.supabase as any)
        .from("newborn_package_types")
        .update(fields)
        .eq("id", id)
        .select("*")
        .single();
      if (error || !updated) throw new Error(error?.message ?? "עדכון החבילה נכשל");
      return updated;
    }
    const { data: created, error } = await (context.supabase as any)
      .from("newborn_package_types")
      .insert(fields)
      .select("*")
      .single();
    if (error || !created) throw new Error(error?.message ?? "יצירת החבילה נכשלה");
    return created;
  });

export const deleteNewbornPackageType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any).from("newborn_package_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
