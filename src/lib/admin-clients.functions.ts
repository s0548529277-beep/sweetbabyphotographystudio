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
 *
 * Also carries `custom_hourly_rate` — a personal negotiated studio rate for
 * this customer (e.g. for a recurring weekly client), applied automatically
 * instead of the standard price list on every booking she places. null/0
 * clears it back to standard pricing.
 *
 * And `can_book_recurring` — whether this customer is allowed to use the
 * weekly recurring series booking flow at all (opt-in, admin-approved
 * per customer, not open to every logged-in visitor).
 */
export const setCustomerLoyalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        cashback_percent: z.number().int().min(0).max(100),
        cashback_expires_at: z.string().max(10).optional().nullable(), // yyyy-mm-dd, empty/null = no expiry
        custom_hourly_rate: z.number().nonnegative().max(10000).optional().nullable(),
        can_book_recurring: z.boolean().optional(),
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
        custom_hourly_rate: data.custom_hourly_rate || null,
        can_book_recurring: !!data.can_book_recurring,
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
    const creditBalance = Number(row?.credit_balance ?? 0);

    // Notify the customer only on a positive top-up (a gesture/credit grant
    // worth celebrating) — never on a negative correction/removal, which
    // isn't good news to announce. Best-effort: a failed email must never
    // undo or block the credit that was already granted above.
    if (data.amount > 0) {
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
        const customerEmail = authUser?.user?.email;
        if (customerEmail) {
          const { sendGmail } = await import("@/integrations/google/gmail.server");
          const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:480px;margin:auto">
            <div style="margin:20px 0;padding:20px;background:linear-gradient(135deg,#fdf3ec,#f8e9d8);border-radius:16px;border:1px solid #f0d9b8;text-align:center;box-shadow:0 6px 18px -8px rgba(201,153,74,0.35)">
              <p style="margin:0 0 4px;font-size:26px;line-height:1">🎁✨🎊</p>
              <p style="margin:0 0 2px;color:#6b4f1d;font-size:14px;font-weight:600">קיבלת זיכוי מהסטודיו!</p>
              <p style="margin:0;color:#8a5a12;font-size:32px;font-weight:800;letter-spacing:0.5px">₪${data.amount.toFixed(0)}</p>
              <p style="margin:6px 0 0;color:#6b8a63;font-size:13px">יתרת הקרדיט שלך כעת: ₪${creditBalance.toFixed(0)} — זמין לשימוש בהזמנה הבאה שלך 💗</p>
            </div>
          </div>`;
          await sendGmail({ to: customerEmail, subject: "קיבלת זיכוי מסטודיו Sweetbaby 🎁", html });
        }
      } catch (e) {
        console.error("[SWEETBABY] manual credit grant notification email failed", e);
      }
    }

    return {
      ok: true,
      credit_balance: creditBalance,
      cashback_credit_balance: Number(row?.cashback_credit_balance ?? 0),
      manual_credit_balance: Number(row?.manual_credit_balance ?? 0),
    };
  });
