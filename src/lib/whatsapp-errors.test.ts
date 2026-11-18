import { describe, expect, test } from "bun:test";
import { classifyWhatsAppError, explainWhatsAppFailure, incomingTypeLabel } from "./whatsapp-errors";

describe("whatsapp-errors", () => {
  test("classifies the errors seen in production", () => {
    expect(classifyWhatsAppError("Business Account locked")).toBe("locked");
    expect(classifyWhatsAppError("Re-engagement message")).toBe("window");
    expect(classifyWhatsAppError(null, 131031)).toBe("locked");
    expect(classifyWhatsAppError(null, "131047")).toBe("window");
    expect(classifyWhatsAppError("something else")).toBe("other");
  });

  test("explains in Hebrew and falls back to the raw text", () => {
    expect(explainWhatsAppFailure("Business Account locked")).toContain("נעול");
    expect(explainWhatsAppFailure("Re-engagement message")).toContain("24 שעות");
    expect(explainWhatsAppFailure("weird")).toContain("weird");
    expect(explainWhatsAppFailure(null)).toContain("לא ידועה");
  });

  test("labels incoming types", () => {
    expect(incomingTypeLabel("audio")).toBe("הקלטה קולית");
    expect(incomingTypeLabel("unsupported")).toBe("הודעה מסוג לא נתמך");
  });
});
