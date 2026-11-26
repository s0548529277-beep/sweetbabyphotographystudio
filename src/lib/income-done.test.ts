import test from "node:test";
import assert from "node:assert/strict";
import { endTimeFrom, isBookingDone, isIncomeDone, isPackageDone, isPropsOrderDone } from "./income-done";

// 2026-11-26 14:00 Israel (winter, +02:00) = 12:00 UTC
const now = new Date("2026-11-26T12:00:00Z");

test("a future booking is not income yet, a past one is", () => {
  assert.equal(isBookingDone({ status: "confirmed", session_date: "2026-11-30", end_time: "12:00" }, now), false);
  assert.equal(isBookingDone({ status: "confirmed", session_date: "2026-11-25", end_time: "12:00" }, now), true);
});

test("today: only after the end time", () => {
  assert.equal(isBookingDone({ status: "confirmed", session_date: "2026-11-26", end_time: "13:30" }, now), true);
  assert.equal(isBookingDone({ status: "confirmed", session_date: "2026-11-26", end_time: "15:00" }, now), false);
  assert.equal(isBookingDone({ status: "confirmed", session_date: "2026-11-26" }, now), false);
});

test("completed / returned / marked done count at once, undated never", () => {
  assert.equal(isBookingDone({ status: "completed", session_date: "2026-12-30" }, now), true);
  assert.equal(isPropsOrderDone({ status: "returned", return_date: "2026-12-30" }, now), true);
  assert.equal(isPackageDone({ session_date: "2026-12-30", shoot_done_at: "2026-11-26T10:00:00Z" }, now), true);
  assert.equal(isPackageDone({ session_date: null }, now), false);
  assert.equal(isIncomeDone({}, now), false);
});

test("props: the return date decides", () => {
  assert.equal(isPropsOrderDone({ status: "confirmed", scheduled_date: "2026-11-20", return_date: "2026-11-27" }, now), false);
  assert.equal(isPropsOrderDone({ status: "confirmed", scheduled_date: "2026-11-20", return_date: "2026-11-24" }, now), true);
  assert.equal(isPropsOrderDone({ status: "active", scheduled_date: "2026-11-26", return_date: "2026-11-26", return_at: "2026-11-26T13:00:00+00:00" }, now), true);
  assert.equal(isPropsOrderDone({ status: "active", scheduled_date: "2026-11-26", return_date: "2026-11-26", return_at: "2026-11-26T20:00:00+00:00" }, now), false);
});

test("package with a duration ends at start + hours", () => {
  assert.equal(endTimeFrom("10:30", 2), "12:30");
  assert.equal(endTimeFrom("22:00", 8), "23:59");
  assert.equal(endTimeFrom("", 2), null);
  assert.equal(isPackageDone({ session_date: "2026-11-26", session_time: "11:00", duration_hours: 2 }, now), true);
  assert.equal(isPackageDone({ session_date: "2026-11-26", session_time: "13:00", duration_hours: 2 }, now), false);
});
