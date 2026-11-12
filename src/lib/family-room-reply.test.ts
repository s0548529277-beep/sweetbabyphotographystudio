import test from "node:test";
import assert from "node:assert/strict";
import { ownText, hoursFromText, hourlySlots, parseFamilyRoomReply } from "./family-room-reply";

const quoted = "\n\nבתאריך יום ה׳ 12 בנוב׳ 2026 כתב סטודיו:\n> מספר הזמנה\n> #abcdef12\n> חדר משפחה";

test("a plain 'קבעתי' is a booking and the id comes from the quoted mail", () => {
  const r = parseFamilyRoomReply("קבעתי" + quoted);
  assert.equal(r.decision, "booked");
  assert.equal(r.hours, "");
  assert.equal(r.idPrefix, "abcdef12");
});

test("only her own text decides, not the quote", () => {
  assert.equal(ownText("קבעתי\n> לא נקבע").includes("לא נקבע"), false);
});

test("hours she names are kept, a range too", () => {
  assert.equal(parseFamilyRoomReply("קבעתי ל-18:00, 19:00" + quoted).hours, "18:00, 19:00");
  assert.equal(hoursFromText("קבעתי 18-20"), "18:00-20:00");
  assert.equal(hoursFromText("קבעתי מ-18:00 עד 20:00"), "18:00-20:00");
});

test("'לא קבעתי' / 'תפוס' is not booked (negation wins)", () => {
  assert.equal(parseFamilyRoomReply("לא קבעתי, החדר תפוס" + quoted).decision, "not_booked");
  assert.equal(parseFamilyRoomReply("החדר תפוס" + quoted).decision, "not_booked");
});

test("unrelated text is no decision", () => {
  assert.equal(parseFamilyRoomReply("תודה רבה" + quoted).decision, null);
});

test("hourlySlots covers the session", () => {
  assert.equal(hourlySlots("18:00:00", "21:00:00"), "18:00, 19:00, 20:00");
  assert.equal(hourlySlots("18:00:00", "20:30:00"), "18:00, 19:00, 20:00");
});
