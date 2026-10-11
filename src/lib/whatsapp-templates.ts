// Plain constants (no `.server` suffix) describing the WhatsApp message
// templates approved in Meta's WhatsApp Manager — see the exact wording
// that was submitted in that approval (AGENTS.md / this session's own
// history has the full text). Only the template NAME, language and the
// ORDER/COUNT of {{1}}, {{2}}, … body variables matter here — Meta renders
// the actual approved text from these on delivery, so this file never
// needs the template body text itself, just enough to build the send
// request and a simple admin form for filling in the variables.
//
// Both approved as category "Utility" — the only kind this app currently
// sends via sendWhatsAppTemplateAdmin (a first message to someone who
// hasn't written in within the last 24h, where a free-form reply is
// rejected by WhatsApp/Meta's own policy).
export type WhatsAppTemplateParam = { key: string; label: string };

export type WhatsAppTemplateDef = {
  id: string;
  label: string;
  language: string;
  params: WhatsAppTemplateParam[];
};

export const WHATSAPP_TEMPLATES: WhatsAppTemplateDef[] = [
  {
    id: "booking_confirmation",
    label: "אישור הזמנה",
    language: "he",
    params: [
      { key: "name", label: "שם הלקוחה" },
      { key: "date", label: "תאריך (לדוגמה 15/11/2026)" },
      { key: "time", label: "שעה (לדוגמה 10:00)" },
    ],
  },
  {
    id: "lead_follow_up",
    label: "חזרה ללקוחה שהשאירה פרטים",
    language: "he",
    params: [{ key: "name", label: "שם הלקוחה" }],
  },
];

export function findWhatsAppTemplate(id: string): WhatsAppTemplateDef | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.id === id);
}
