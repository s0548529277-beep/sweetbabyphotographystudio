import test from "node:test";
import assert from "node:assert/strict";
import { computeMaaser, defaultIncluded, isCardSettlement, type MaaserTxn } from "./maaser";

const base = { date: "2026-10-01", depositStatus: null, paymentMethod: null, unpaid: false };
const t = (o: Partial<MaaserTxn> & Pick<MaaserTxn, "id" | "kind" | "amount">): MaaserTxn => ({
  title: "x",
  isPersonal: false,
  ...base,
  ...o,
});

test("10% of bank income minus business expenses; personal expenses not deducted", () => {
  const rows = [
    t({ id: "1", kind: "income", amount: 1000 }),
    t({ id: "2", kind: "income", amount: 500, isPersonal: true }),
    t({ id: "3", kind: "expense", amount: 300 }),
    t({ id: "4", kind: "expense", amount: 200, isPersonal: true }),
  ];
  const r = computeMaaser(rows, defaultIncluded);
  assert.equal(r.income, 1500);
  assert.equal(r.expenses, 300);
  assert.equal(r.maaser, 120);
});

test("cash, unpaid, pending and card-settlement lines are off by default", () => {
  assert.equal(defaultIncluded(t({ id: "a", kind: "income", amount: 1, paymentMethod: "cash" })), false);
  assert.equal(defaultIncluded(t({ id: "b", kind: "income", amount: 1, depositStatus: "pending" })), false);
  assert.equal(defaultIncluded(t({ id: "c", kind: "expense", amount: 1, unpaid: true })), false);
  assert.equal(isCardSettlement({ kind: "expense", title: "כרטיסי אשראי ל" }), true);
  assert.equal(defaultIncluded(t({ id: "d", kind: "expense", amount: 1, title: "ישראכרט בע\"מ" })), false);
});

test("overrides win and negative net gives zero", () => {
  const rows = [t({ id: "1", kind: "income", amount: 100 }), t({ id: "2", kind: "expense", amount: 300 })];
  assert.equal(computeMaaser(rows, defaultIncluded).maaser, 0);
  assert.equal(computeMaaser(rows, (x) => x.kind === "income").maaser, 10);
});
