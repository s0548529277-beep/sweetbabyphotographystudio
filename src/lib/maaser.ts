/**
 * מעשר (10% to charity) — pure calculation helpers for the admin finance page.
 *
 * The owner's definition: money that ENTERED THE BANK (personal and business
 * income alike) minus the BUSINESS expenses (credit-card charges from Cal and
 * the general/manual expenses). Personal expenses are not deducted, bank lines
 * that merely pay the credit-card bill are not counted twice (the card's own
 * detail is), and income that did not reach the bank (cash, not yet paid) is
 * left out. All of these are only DEFAULTS: every line can be switched on/off
 * by the owner and the choice is remembered per line.
 */

export const MAASER_RATE = 0.1;
export const MAASER_OVERRIDES_KEY = "finance_maaser_overrides";

export type MaaserTxn = {
  id: string;
  kind: "income" | "expense";
  title: string;
  date: string; // yyyy-mm-dd
  amount: number;
  isPersonal: boolean;
  /** Orders/bookings only: "pending" = deposit not paid yet. */
  depositStatus: string | null;
  /** How the customer paid (cash / card / transfer / bit …), null for manual/imported lines. */
  paymentMethod: string | null;
  /** Expense recorded as a debt that was not paid yet. */
  unpaid: boolean;
};

export type MaaserOverrides = Record<string, boolean>;

/** Bank lines that only settle a credit-card bill — the card's own detail is the real expense. */
const CARD_SETTLEMENT = /^(כרטיסי אשראי|כרטיס אשראי|ישראכרט|כאל|cal\b|לאומי קארד|מקס\b|max\b|ויזה|דיינרס|אמריקן אקספרס|isracard)/i;

export function isCardSettlement(t: Pick<MaaserTxn, "title" | "kind">): boolean {
  return t.kind === "expense" && CARD_SETTLEMENT.test((t.title || "").trim());
}

export function defaultIncluded(t: MaaserTxn): boolean {
  if (t.kind === "income") {
    if (t.depositStatus === "pending") return false; // not paid yet
    if (t.paymentMethod === "cash") return false; // did not enter the bank
    return true;
  }
  if (t.isPersonal) return false; // only business expenses are deducted
  if (t.unpaid) return false; // not out of the account yet
  if (isCardSettlement(t)) return false; // counted through the card detail
  return true;
}

export function computeMaaser(txns: MaaserTxn[], isIncluded: (t: MaaserTxn) => boolean) {
  const lines = txns.map((t) => ({ t, on: isIncluded(t) }));
  let income = 0;
  let incomeBusiness = 0;
  let incomePersonal = 0;
  let expenses = 0;
  for (const { t, on } of lines) {
    if (!on) continue;
    if (t.kind === "income") {
      income += t.amount;
      if (t.isPersonal) incomePersonal += t.amount;
      else incomeBusiness += t.amount;
    } else {
      expenses += t.amount;
    }
  }
  const net = income - expenses;
  return {
    lines,
    income,
    incomeBusiness,
    incomePersonal,
    expenses,
    net,
    maaser: Math.max(0, net) * MAASER_RATE,
  };
}

export function parseOverrides(value: string | null | undefined): MaaserOverrides {
  if (!value) return {};
  try {
    const raw = JSON.parse(value) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: MaaserOverrides = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
