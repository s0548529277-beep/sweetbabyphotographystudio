import test from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_QUESTIONS, validateAnswers } from "./funnels";
import { applyFunnelQuestions, sanitizeFunnelOverrides } from "./funnel-overrides";

test("no overrides = as coded", () => {
  assert.equal(applyFunnelQuestions("studio", FUNNEL_QUESTIONS.studio, {}), FUNNEL_QUESTIONS.studio);
});

test("renames, hides and adds own questions; answers validate against the effective questions", () => {
  const q0 = FUNNEL_QUESTIONS.studio[0];
  const ov = sanitizeFunnelOverrides({
    studio: {
      questions: { [q0.id]: { title: "כותרת חדשה", options: { [q0.options[0].id]: { hidden: true, label: "חדש" } } } },
      custom: [{ id: "x1", title: "איך שמעת עלינו?", options: [{ id: "a", label: "אינסטגרם" }, { id: "b", label: "חברה" }] }],
    },
  });
  const qs = applyFunnelQuestions("studio", FUNNEL_QUESTIONS.studio, ov);
  assert.equal(qs[0].title, "כותרת חדשה");
  assert.equal(qs[0].options.length, q0.options.length - 1);
  assert.equal(qs[qs.length - 1].id, "c_x1");
  const answers: Record<string, string> = {};
  for (const q of qs) answers[q.id] = q.options[0].id;
  assert.ok(validateAnswers("studio", answers, qs));
});

test("drops junk", () => {
  const ov = sanitizeFunnelOverrides({ studio: { theme: { from: "red", solid: "#112233" } }, entry: { custom: [{ id: "a", title: "x", options: [] }] } });
  assert.deepEqual(ov.studio?.theme, { solid: "#112233" });
  assert.equal(ov.entry?.custom, undefined);
  assert.deepEqual(sanitizeFunnelOverrides(42), {});
});

test("landing: keeps headline / bullets (max 5) and drops a bad image", () => {
  const ov = sanitizeFunnelOverrides({ studio: { landing: { headline: "כותרת", bullets: ["א", "", "ב", "ג", "ד", "ה", "ו"], image: "javascript:x" } } });
  assert.equal(ov.studio?.landing?.headline, "כותרת");
  assert.deepEqual(ov.studio?.landing?.bullets, ["א", "ב", "ג", "ד", "ה"]);
  assert.equal(ov.studio?.landing?.image, undefined);
});
