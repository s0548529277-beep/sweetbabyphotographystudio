// Plain-language (Hebrew) explanations for the errors Meta's WhatsApp Cloud
// API returns, shared by the sender (whatsapp.server.ts), the webhook status
// handler and the studio alert mail. Pure functions, no server-only imports.
//
// Meta error codes seen in this project's whatsapp_messages.error column:
//   131031 / "Business Account locked"  — the account is restricted (usually until business verification)
//   131047 / "Re-engagement message"    — free-form text outside the 24h customer window; needs an approved template
//   131026                              — the number is not on WhatsApp / cannot receive
//   131049                              — Meta limited the message to protect the ecosystem (marketing quality)

export type WhatsAppFailureKind = "locked" | "window" | "not_on_whatsapp" | "limited" | "other";

export function classifyWhatsAppError(raw: string | null | undefined, code?: number | string | null): WhatsAppFailureKind {
  const text = String(raw ?? "").toLowerCase();
  const c = code == null ? "" : String(code);
  if (c === "131031" || text.includes("locked")) return "locked";
  if (c === "131047" || text.includes("re-engagement") || text.includes("24 hour") || text.includes("24h")) return "window";
  if (c === "131026" || text.includes("undeliverable") || text.includes("not a whatsapp")) return "not_on_whatsapp";
  if (c === "131049" || text.includes("ecosystem")) return "limited";
  return "other";
}

export function explainWhatsAppFailure(raw: string | null | undefined, code?: number | string | null): string {
  switch (classifyWhatsAppError(raw, code)) {
    case "locked":
      return "חשבון הוואטסאפ העסקי נעול או מוגבל על ידי מטא (בדרך כלל עד לסיום אימות העסק). אף הודעה לא תעבור עד שהנעילה תוסר ב-Meta Business Suite.";
    case "window":
      return "עברו יותר מ-24 שעות מאז שהלקוחה כתבה, ולכן אפשר לשלוח לה רק תבנית מאושרת (ולא הודעה רגילה).";
    case "not_on_whatsapp":
      return "המספר לא רשום בוואטסאפ או שאי אפשר לשלוח אליו.";
    case "limited":
      return "מטא הגבילה את ההודעה הזו (הגבלת איכות/שיווק). נסי שוב מאוחר יותר או שלחי תבנית מאושרת.";
    default:
      return raw ? `השליחה נכשלה: ${raw}` : "השליחה נכשלה מסיבה לא ידועה.";
  }
}

/** Human label for incoming message types the site cannot show or answer. */
export function incomingTypeLabel(type: string): string {
  switch (type) {
    case "audio":
      return "הקלטה קולית";
    case "image":
      return "תמונה";
    case "video":
      return "סרטון";
    case "document":
      return "קובץ";
    case "sticker":
      return "מדבקה";
    case "location":
      return "מיקום";
    case "contacts":
      return "איש קשר";
    case "reaction":
      return "תגובה (אימוג'י)";
    default:
      return "הודעה מסוג לא נתמך";
  }
}
