import { describe, expect, test } from "bun:test";
import { planNonTextReply, shouldAlertOwner } from "./whatsapp-nontext";

describe("planNonTextReply", () => {
  test("voice note gets a fixed reply that never promises anything", () => {
    const p = planNonTextReply("audio", null);
    expect(p.kind).toBe("fixed");
    if (p.kind === "fixed") {
      expect(p.reply).toContain("הקלטה");
      expect(p.reply).not.toMatch(/₪|פנוי|תפוס|מחיר/);
    }
  });

  test("photo with a caption goes to the AI with the caption", () => {
    const p = planNonTextReply("image", "כמה עולה לשכור את זה?");
    expect(p).toEqual({ kind: "ai", text: "[הלקוחה צירפה תמונה] כמה עולה לשכור את זה?" });
  });

  test("photo / video / file without a caption gets a fixed reply", () => {
    for (const t of ["image", "video", "document"]) {
      expect(planNonTextReply(t, null).kind).toBe("fixed");
      expect(planNonTextReply(t, "   ").kind).toBe("fixed");
    }
  });

  test("a document whose caption is just its file name is not a question", () => {
    expect(planNonTextReply("document", "חוזה.pdf").kind).toBe("fixed");
    expect(planNonTextReply("document", "IMG_2041.JPG").kind).toBe("fixed");
    expect(planNonTextReply("document", "אפשר לשנות את התאריך?").kind).toBe("ai");
  });

  test("location gets the studio address and a Waze link", () => {
    const p = planNonTextReply("location", null);
    expect(p.kind).toBe("fixed");
    if (p.kind === "fixed") expect(p.reply).toContain("waze");
  });

  test("contact card gets a fixed reply", () => {
    expect(planNonTextReply("contacts", null).kind).toBe("fixed");
  });

  test("reactions, stickers and unknown types get nothing", () => {
    for (const t of ["reaction", "sticker", "unsupported", "button"]) {
      expect(planNonTextReply(t, null)).toEqual({ kind: "none" });
    }
  });
});

describe("shouldAlertOwner", () => {
  test("only real content alerts the owner", () => {
    expect(shouldAlertOwner("audio")).toBe(true);
    expect(shouldAlertOwner("image")).toBe(true);
    expect(shouldAlertOwner("location")).toBe(true);
    expect(shouldAlertOwner("reaction")).toBe(false);
    expect(shouldAlertOwner("sticker")).toBe(false);
    expect(shouldAlertOwner("text")).toBe(false);
  });
});
