/**
 * Monthly recurring expenses (e.g. rent, ₪1200/month) — admin-defined on
 * /admin/finance, auto-inserted into `expenses` once per month by
 * runDueRecurringExpenses below, so she never has to type the same expense
 * by hand every month. Not wrapped in createServerFn/requireSupabaseAuth:
 * this runs as a trusted periodic job (called from
 * api.send-booking-reminders.ts alongside the other scheduled jobs), not on
 * behalf of a logged-in user — same pattern as runDueOrderReminders.
 */
export async function runDueRecurringExpenses(): Promise<{ checked: number; created: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const dayOfMonth = now.getDate();

  const { data: rows, error } = await (supabaseAdmin as any)
    .from("recurring_expenses")
    .select("*")
    .eq("active", true);
  if (error) {
    console.error("[SWEETBABY] recurring expenses scan failed", error);
    return { checked: 0, created: 0 };
  }

  let created = 0;
  for (const r of rows ?? []) {
    if (r.last_generated_month === monthKey) continue;
    const day = Number(r.day_of_month ?? 1);
    if (dayOfMonth < day) continue;

    const spentOn = `${monthKey}-${String(day).padStart(2, "0")}`;
    let insErr = (
      await (supabaseAdmin as any).from("expenses").insert({
        title: r.title,
        amount: r.amount,
        category: r.category,
        spent_on: spentOn,
        notes: "הוצאה קבועה אוטומטית",
        is_personal: r.is_personal,
      })
    ).error;
    // is_personal on expenses is a (previously) brand-new column — same
    // schema-fallback caution as insertWithPersonalFallback in
    // admin.finance.tsx, applied here since this runs with no user watching
    // to see a failed insert and retry it herself.
    if (insErr && /does not exist/i.test(insErr.message ?? "")) {
      insErr = (
        await (supabaseAdmin as any).from("expenses").insert({
          title: r.title,
          amount: r.amount,
          category: r.category,
          spent_on: spentOn,
          notes: "הוצאה קבועה אוטומטית",
        })
      ).error;
    }
    if (insErr) {
      console.error("[SWEETBABY] recurring expense auto-insert failed", r.id, insErr);
      continue;
    }

    await (supabaseAdmin as any)
      .from("recurring_expenses")
      .update({ last_generated_month: monthKey })
      .eq("id", r.id);
    created += 1;
  }

  return { checked: (rows ?? []).length, created };
}
