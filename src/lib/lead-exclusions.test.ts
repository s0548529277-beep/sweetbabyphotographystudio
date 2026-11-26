import test from "node:test";
import assert from "node:assert/strict";
import { isOwnerTestContact } from "./lead-exclusions";

test("the owner and her husband are test contacts", () => {
  assert.equal(isOwnerTestContact({ name: "מיכל אפרת סיבוני", email: "m0548529277@gmail.com", phone: "0548529277" }), true);
  assert.equal(isOwnerTestContact({ name: "נתנאל", email: "xv05832@gmail.com", phone: "058-327-0184" }), true);
  assert.equal(isOwnerTestContact({ name: "מיכל אפרת אציבעוני", email: "michl.mmm.mmm@gmail.com", phone: "0583270184" }), true);
  assert.equal(isOwnerTestContact({ name: "נתנאל סיובני" }), true);
  assert.equal(isOwnerTestContact({ phone: "+972 54-852-9277" }), true);
  assert.equal(isOwnerTestContact({ email: "m0548529277+test@gmail.com" }), true);
});

test("real customers stay", () => {
  assert.equal(isOwnerTestContact({ name: "מיכל רביב", email: "x@gmail.com", phone: "0501234567" }), false);
  assert.equal(isOwnerTestContact({ name: "מיכל", email: "nyklmdr1@gmail.com" }), false);
  assert.equal(isOwnerTestContact({ name: "רחל סיבוני", phone: "0521111111" }), false);
  // the studio's own e-mail typed next to somebody else's phone: a real person, not a test
  assert.equal(isOwnerTestContact({ name: "מרים", email: "s0548529277@gmail.com", phone: "0504164588" }), false);
  assert.equal(isOwnerTestContact({}), false);
});
