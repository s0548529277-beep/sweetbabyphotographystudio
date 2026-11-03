import test from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_QUESTIONS, evaluateFunnel, validateAnswers, parseFunnelSettings, answerLines } from "./funnels";

test("validateAnswers needs every question answered with one of its own options", () => {
  assert.equal(validateAnswers("studio", { visits: "v2", hours: "h2", history: "new" }), true);
  assert.equal(validateAnswers("studio", { visits: "v2", hours: "h2" }), false);
  assert.equal(validateAnswers("studio", { visits: "zzz", hours: "h2", history: "new" }), false);
});

test("studio: few visits → pay per hour, many visits → a punch card with a saving", () => {
  const few = evaluateFunnel("studio", { visits: "v1", hours: "h1", history: "new" });
  assert.equal(few.headline, "תשלום לפי שעה");
  const many = evaluateFunnel("studio", { visits: "v3", hours: "h2", history: "regular" });
  assert.match(many.headline, /כרטיסייה/);
  assert.match(many.recommendation, /חיסכון/);
  assert.equal(many.hot, true);
});

test("studio: a one-time renter / first-timer gets pay-per-hour plus the sign-up wheel; a regular does not", () => {
  const once = evaluateFunnel("studio", { history: "once", visits: "v0", hours: "h2" });
  assert.equal(once.headline, "תשלום לפי שעה");
  assert.equal(once.signup, true);
  assert.match(once.recommendation, /גלגל/);
  assert.equal(evaluateFunnel("studio", { history: "new", visits: "v2", hours: "h1" }).signup, true);
  assert.equal(evaluateFunnel("studio", { history: "regular", visits: "v3", hours: "h2" }).signup, false);
});

test("studio: 12 visits of 1h picks the 10-entry card (1300 + 2*180 < 2*750)", () => {
  const r = evaluateFunnel("studio", { visits: "v4", hours: "h1", history: "before" });
  assert.match(r.headline, /10/);
});

test("newborn: just born + basket + album is a hot lead and recommends a real package", () => {
  const r = evaluateFunnel("newborn", { stage: "born", basket: "yes", priority: "album" });
  assert.equal(r.hot, true);
  assert.match(r.headline, /₪/);
});

test("photography: soon is hot only with a second signal", () => {
  assert.equal(evaluateFunnel("photography", { where: "studio", what: "kids", when: "soon", priority: "digital" }).hot, false);
  assert.equal(evaluateFunnel("photography", { where: "studio", what: "kids", when: "soon", priority: "album" }).hot, true);
});

test("every funnel's first option set evaluates without throwing", () => {
  for (const f of ["studio", "photography", "newborn"] as const) {
    const a: Record<string, string> = {};
    for (const q of FUNNEL_QUESTIONS[f]) a[q.id] = q.options[0].id;
    assert.ok(evaluateFunnel(f, a).recommendation.length > 10);
    assert.equal(answerLines(f, a).length, FUNNEL_QUESTIONS[f].length);
  }
});

test("settings: everything is on by default, only an explicit false switches a funnel off", () => {
  assert.deepEqual(parseFunnelSettings(null), { entry: true, studio: true, photography: true, newborn: true });
  assert.equal(parseFunnelSettings('{"studio":false}').studio, false);
  assert.equal(parseFunnelSettings("not json").newborn, true);
});
