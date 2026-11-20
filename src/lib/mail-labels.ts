/**
 * Gmail label "types" for the mail the sites send to the studio inbox (owner request 2026-11-19: "divide the studio
 * orders, order requests and leads from the site into types"). Pure and dependency-free so it is easy to test; the
 * code that talks to Gmail lives in `integrations/google/gmail.server.ts` (`applySiteMailLabel`).
 *
 * All labels sit under the existing parent label "הזמנות ולידים" (which Gmail's own filter already puts on every
 * mail the sites send), so in Gmail they show as sub-labels of it.
 */

export type SiteMailKind = "studio" | "props" | "lead_quiz" | "lead_chat" | "lead_form" | "lead_phone" | "lead_visitor";

export const SITE_MAIL_PARENT_LABEL = "הזמנות ולידים";

export const SITE_MAIL_LABELS: Record<SiteMailKind, { name: string; background: string; text: string }> = {
  studio: { name: `${SITE_MAIL_PARENT_LABEL}/הזמנת סטודיו`, background: "#4a86e8", text: "#ffffff" },
  props: { name: `${SITE_MAIL_PARENT_LABEL}/הזמנת אביזרים`, background: "#16a765", text: "#ffffff" },
  lead_quiz: { name: `${SITE_MAIL_PARENT_LABEL}/ליד שאלון`, background: "#ffad47", text: "#000000" },
  lead_chat: { name: `${SITE_MAIL_PARENT_LABEL}/ליד צ'אט`, background: "#a479e2", text: "#ffffff" },
  lead_form: { name: `${SITE_MAIL_PARENT_LABEL}/ליד טופס`, background: "#f691b2", text: "#000000" },
  lead_phone: { name: `${SITE_MAIL_PARENT_LABEL}/ליד טלפון`, background: "#2da2bb", text: "#ffffff" },
  lead_visitor: { name: `${SITE_MAIL_PARENT_LABEL}/מבקרת חמה`, background: "#fb4c2f", text: "#ffffff" },
};

/**
 * Which type a site mail is, judged by its subject line (null = not one of these, so no label is added).
 * Order matters: the lead kinds are checked first because some of their subjects also contain words such as "הזמנה".
 */
export function classifySiteMail(subject: string): SiteMailKind | null {
  const s = (subject || "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  // Hot-visitor alerts from the visitor tracker: "🔥 ליד חם: <name>" / "🔥 חזרה לאתר: <name>" (colon, not the funnel's "·").
  if (/(?:ליד חם|חזרה לאתר)\s*:/.test(s)) return "lead_visitor";
  // Phone-bot message and the photographer-site contact form that is mailed with the same subject.
  if (/הודעה מלקוחה בטלפון/.test(s)) return "lead_phone";
  // Site chat.
  if (/הודעה מ(?:ה)?צ['׳]אט/.test(s)) return "lead_chat";
  // Funnel / quiz leads and the "she picked a package" mail.
  if (/ליד (?:חם|חדש)\s*(?:·|מהשאלון)|בחרה בחבילה/.test(s)) return "lead_quiz";
  // Contact form, photography inquiries and birth-basket interest.
  if (/פנייה מטופס|פנייה · צילומים עם מיכל|בקשת צילומים ·|מעוניינת במימוש סל לידה/.test(s)) return "lead_form";

  // Props rental: the order request and everything after it (confirmation, edits, pickup reminder).
  if (/בקשת הזמנה #|השכרת אביזרים|איסוף האביזרים/.test(s)) return "props";
  // Studio rental: booking request, confirmation, reminders, edits, family room and the follow-ups to the customer.
  if (
    /בקשת שריון|השכרת סטודיו|תזכורת לצילומים המתקרבים|סדרת שריונים|השלמת תשלום המקדמה|המקום שלך בסטודיו|ההזמנה שלך בסטודיו|תזכורת לסשן שלך בסטודיו|תודה שהיית אצלנו|חדר המשפחה|בקשת עריכת הזמנה|בקשת העריכה להזמנה|קיבלנו את בקשת העריכה/.test(
      s,
    )
  )
    return "studio";
  return null;
}
