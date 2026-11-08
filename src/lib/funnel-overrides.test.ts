import { describe, expect, it } from "bun:test";
import { FUNNEL_QUESTIONS, validateAnswers } from "./funnels";
import { applyFunnelQuestions, sanitizeFunnelOverrides } from "./funnel-overrides";

describe("funnel overrides", () => {
  it("no overrides = as coded", () => {
    expect(applyFunnelQuestions("studio", FUNNEL_QUESTIONS.studio, {})).toBe(FUNNEL_QUESTIONS.studio);
  });
  it("renames, hides (never below 2) and adds own questions", () => {
    const q0 = FUNNEL_QUESTIONS.studio[0];
    const ov = sanitizeFunnelOverrides({
      studio: {
        questions: { [q0.id]: { title: "כותרת חדשה", options: { [q0.options[0].id]: { hidden: true, label: "חדש" } } } },
        custom: [{ id: "x1", title: "איך שמעת עלינו?", options: [{ id: "a", label: "אינסטגרם" }, { id: "b", label: "חברה" }] }],
      },
    });
    const qs = applyFunnelQuestions("studio", FUNNEL_QUESTIONS.studio, ov);
    expect(qs[0].title).toBe("כותרת חדשה");
    expect(qs[0].options.length).toBe(q0.options.length - 1);
    expect(qs[qs.length - 1].id).toBe("c_x1");
    const answers: Record<string, string> = {};
    for (const q of qs) answers[q.id] = q.options[0].id;
    expect(validateAnswers("studio", answers, qs)).toBe(true);
  });
  it("drops junk", () => {
    const ov = sanitizeFunnelOverrides({ studio: { theme: { from: "red", solid: "#112233" } }, entry: { custom: [{ id: "a", title: "x", options: [] }] } });
    expect(ov.studio?.theme).toEqual({ solid: "#112233" });
    expect(ov.entry?.custom).toBeUndefined();
    expect(sanitizeFunnelOverrides(42)).toEqual({});
  });
});
