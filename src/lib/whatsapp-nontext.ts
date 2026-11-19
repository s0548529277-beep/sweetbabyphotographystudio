// What the WhatsApp bot does with an incoming message that is not plain text.
// Pure (no I/O) so it can be tested: the webhook and `whatsapp-bot.server.ts`
// only carry out the plan returned here.
//
// Rules (owner, 2026-11-19: "the bot should answer everything"):
//  - a photo / video / file WITH a caption: the caption is a real question, so
//    it goes to the normal AI reply (marked as "attached a photo");
//  - a voice note, or a photo / video / file with no caption, a location and a
//    contact card: a short FIXED reply (no AI, so it can never promise a time,
//    a price or availability) saying what the bot can and cannot open;
//  - a reaction (emoji on a message) and a sticker are acknowledgements, not
//    questions: no reply and no owner mail.
import { ARRIVAL_ADDRESS, STUDIO_WAZE_URL } from "./arrival";
import { incomingTypeLabel } from "./whatsapp-errors";

export type NonTextPlan =
  | { kind: "none" }
  | { kind: "ai"; text: string }
  | { kind: "fixed"; reply: string; historyNote: string };

/** Types the owner should still be mailed about (the bot cannot open the content itself). */
export function shouldAlertOwner(type: string): boolean {
  return type !== "reaction" && type !== "sticker" && type !== "text";
}

const VIRTUAL = "אני העוזרת הווירטואלית של הסטודיו";

export function planNonTextReply(type: string, caption: string | null | undefined): NonTextPlan {
  const cap = (caption ?? "").trim();
  const label = incomingTypeLabel(type);

  if ((type === "image" || type === "video" || type === "document") && cap) {
    // The file name of a document is stored as its caption when it has none —
    // that is not a question, so it must not reach the AI.
    if (type === "document" && /\.[a-z0-9]{2,5}$/i.test(cap)) {
      return fixedForFile(type, label);
    }
    return { kind: "ai", text: `[הלקוחה צירפה ${label}] ${cap}` };
  }

  switch (type) {
    case "audio":
      return {
        kind: "fixed",
        historyNote: "[הלקוחה שלחה הקלטה קולית]",
        reply: `קיבלתי את ההקלטה 💗 ${VIRTUAL} ואני לא יכולה להאזין להקלטות. אפשר לכתוב לי כאן במילים במה לעזור, ובינתיים העברתי את ההקלטה למיכל והיא תחזור אלייך.`,
      };
    case "image":
    case "video":
    case "document":
      return fixedForFile(type, label);
    case "location":
      return {
        kind: "fixed",
        historyNote: "[הלקוחה שלחה מיקום]",
        reply: `קיבלתי את המיקום 💗 הסטודיו נמצא ב${ARRIVAL_ADDRESS.split(" — ")[0]}. ניווט בוויז: ${STUDIO_WAZE_URL}\nאיך אפשר לעזור?`,
      };
    case "contacts":
      return {
        kind: "fixed",
        historyNote: "[הלקוחה שלחה איש קשר]",
        reply: `קיבלתי את איש הקשר 💗 ${VIRTUAL} ואני לא יכולה לפתוח אנשי קשר. אפשר לכתוב לי כאן במה לעזור.`,
      };
    default:
      return { kind: "none" };
  }
}

function fixedForFile(type: string, label: string): NonTextPlan {
  const the = type === "image" ? "התמונה" : type === "video" ? "הסרטון" : "הקובץ";
  return {
    kind: "fixed",
    historyNote: `[הלקוחה שלחה ${label}]`,
    reply: `קיבלתי את ${the} 💗 ${VIRTUAL} ואני לא יכולה לפתוח ${type === "image" ? "תמונות" : type === "video" ? "סרטונים" : "קבצים"}. אפשר לכתוב לי כאן במילים במה לעזור, או שמיכל תראה ותחזור אלייך.`,
  };
}
