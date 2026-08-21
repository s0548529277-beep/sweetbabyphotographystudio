/**
 * Server-only helpers for the per-customer cashback loyalty program.
 * Every function here takes an already-created supabaseAdmin (service-role)
 * client — credit_balance must never be touched through the user-scoped
 * client, since customer_loyalty has no authenticated write policy at all.
 */

/**
 * Credits `amount * cashback_percent / 100` to the customer's balance, if
 * she's enrolled and (when set) the program hasn't expired. Silent no-op if
 * she isn't enrolled. Never throws — a loyalty hiccup must never block a
 * booking/order confirmation.
 */
export async function awardCashback(supabaseAdmin: any, userId: string, amount: number): Promise<void> {
  if (!amount || amount <= 0) return;
  try {
    const { data: loyalty } = await supabaseAdmin
      .from("customer_loyalty")
      .select("cashback_percent, cashback_expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!loyalty || !loyalty.cashback_percent) return;
    if (loyalty.cashback_expires_at && new Date(loyalty.cashback_expires_at) < new Date()) return;
    const earned = Math.round(amount * loyalty.cashback_percent) / 100;
    if (earned <= 0) return;
    // Atomic +earned on credit_balance (single UPDATE, row-locked) instead
    // of read-then-write, so a concurrent award/deduction for this same
    // customer can never clobber this one. See migration
    // 20260820090000_atomic_loyalty_credit_adjust.sql.
    const { error } = await supabaseAdmin.rpc("adjust_loyalty_credit", { p_user_id: userId, p_delta: earned });
    if (error) throw error;
  } catch (e) {
    console.error("[SWEETBABY] cashback award failed", e);
  }
}

/**
 * Reads the customer's current credit balance and returns how much of
 * `requested` can actually be applied — capped at her real balance and at
 * `maxAmount` (the price left to discount). Does NOT deduct anything; call
 * deductCredit with this same amount only after the booking/order row has
 * been successfully created, so a failed booking never loses the customer's
 * credit.
 */
export async function previewCreditUse(
  supabaseAdmin: any,
  userId: string,
  requested: number,
  maxAmount: number,
): Promise<number> {
  if (!requested || requested <= 0) return 0;
  try {
    const { data: loyalty } = await supabaseAdmin
      .from("customer_loyalty")
      .select("credit_balance")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = Number(loyalty?.credit_balance ?? 0);
    return Math.max(0, Math.min(requested, balance, Math.max(0, maxAmount)));
  } catch (e) {
    console.error("[SWEETBABY] credit balance read failed", e);
    return 0;
  }
}

/** Deducts `amount` from the customer's credit balance, drawing from her cashback credit first, then manual credit. Call only after the booking/order it paid for was successfully created. Returns the actual split so the caller can record it (needed to refund the right bucket on cancellation). */
export async function deductCredit(
  supabaseAdmin: any,
  userId: string,
  amount: number,
): Promise<{ spentCashback: number; spentManual: number }> {
  if (!amount || amount <= 0) return { spentCashback: 0, spentManual: 0 };
  try {
    // Atomic, row-locked split across both buckets in one statement — see
    // spend_loyalty_credit in 20260822090000_split_loyalty_credit_by_source.sql.
    const { data, error } = await supabaseAdmin.rpc("spend_loyalty_credit", { p_user_id: userId, p_amount: amount });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { spentCashback: Number(row?.spent_cashback ?? 0), spentManual: Number(row?.spent_manual ?? 0) };
  } catch (e) {
    console.error("[SWEETBABY] credit deduction failed", e);
    return { spentCashback: 0, spentManual: 0 };
  }
}
