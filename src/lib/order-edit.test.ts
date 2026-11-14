import { test } from "node:test";
import assert from "node:assert/strict";
import { editNeedsApproval, sessionStartMs, addMinutesHHMM } from "./order-edit";

const H = 3600_000;
const now = Date.parse("2026-11-14T19:20:00Z"); // 21:20 Israel
test("far away -> no approval", () => {
  const s = now + 72 * H;
  assert.equal(editNeedsApproval({ oldStartMs: s, newStartMs: s + 24 * H, nowMs: now }).needs, false);
});
test("current start within 24h -> approval", () => {
  assert.equal(editNeedsApproval({ oldStartMs: now + 10 * H, newStartMs: now + 80 * H, nowMs: now }).needs, true);
});
test("new start within 24h -> approval even if current is far", () => {
  assert.equal(editNeedsApproval({ oldStartMs: now + 80 * H, newStartMs: now + 20 * H, nowMs: now }).needs, true);
});
test("exactly 24h -> no approval, just under -> approval", () => {
  assert.equal(editNeedsApproval({ oldStartMs: now + 24 * H, newStartMs: now + 24 * H, nowMs: now }).needs, false);
  assert.equal(editNeedsApproval({ oldStartMs: now + 24 * H - 1, newStartMs: now + 24 * H, nowMs: now }).needs, true);
});
test("israel wall clock", () => {
  assert.equal(sessionStartMs("2026-11-15", "21:20"), Date.parse("2026-11-15T19:20:00Z")); // winter +02:00
  assert.equal(addMinutesHHMM("10:00", 180), "13:00");
});
