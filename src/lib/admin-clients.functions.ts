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

/**
 * Enrolls (or updates) a customer in the cashback loyalty program: she earns
 * `cashback_percent`% of every paid studio booking / props order as credit
 * toward future orders, until `cashback_expires_at` (or forever if null).
 * Never touches credit_balance — that's only ever adjusted by the earn/spend
 * server logic, never reset by re-saving the enrollment settings.
 */
export const setCustomerLoyalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        cashback_percent: z.number().int().min(0).max(100),
        cashback_expires_at: z.string().max(10).optional().nullable(), // yyyy-mm-dd, empty/null = no expiry
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("customer_loyalty").upsert(
      {
        user_id: data.user_id,
        cashback_percent: data.cashback_percent,
        cashback_expires_at: data.cashback_expires_at ? new Date(data.cashback_expires_at).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Immediately grants (or removes, if amount is negative) a one-off manual
 * credit adjustment to a customer's balance — independent of the ongoing
 * cashback-% program, e.g. as a gesture, correction, or refund substitute.
 * Applied atomically via adjust_loyalty_credit (upsert + row lock), so it
 * can never race with a concurrent cashback award/deduction from a payment
 * confirming at the same moment, and it works even for a customer who has
 * no customer_loyalty row yet.
 */
export const grantManualCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        amount: z.number().refine((n) => n !== 0, "סכום לא יכול להיות 0"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("adjust_loyalty_credit", {
      p_user_id: data.user_id,
      p_delta: data.amount,
      p_source: "manual",
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    return {
      ok: true,
      credit_balance: Number(row?.credit_balance ?? 0),
      cashback_credit_balance: Number(row?.cashback_credit_balance ?? 0),
      manual_credit_balance: Number(row?.manual_credit_balance ?? 0),
    };
  });
