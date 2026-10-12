// Plain constants (no `.server` suffix) describing the WhatsApp message
// templates approved/pending in Meta's WhatsApp Manager. `id` here is sent
// VERBATIM as the Meta template name (see sendWhatsAppTemplate's call site
// in admin-whatsapp.functions.ts) — it must match the real name EXACTLY,
// character for character, or sending fails live (confirmed: a wrong name
// produced Meta error 132001 in production). Only confirmed entries,
// copy-pasted directly from the real WhatsApp Manager list, belong here —
// never a guessed name.
//
// 2026-10-12: rebuilding this list from scratch against the 5 real
// templates in the account (previous entries — booking_confirmation,
// lead_follow_up — were this app's own guessed names/shapes from before
// the real templates existed, and don't match any of the 5 actual ones).
// Only 1 of 5 confirmed so far — see each entry's own note.
export type WhatsAppTemplateParam = { key: string; label: string };

export type WhatsAppTemplateDef = {
  id: string;
  label: string;
  language: string;
  params: WhatsAppTemplateParam[];
};

export const WHATSAPP_TEMPLATES: WhatsAppTemplateDef[] = [
  {
    // Pasted exactly as sent — category "שירות ציבורי" (Utility), language
    // Hebrew, body: "שלום {{1}}, תודה שהזמנתם עם {{2}}. התור שלך ל{{3}}
    // ב{{4}} בשעה {{5}} אושר." NOTE: confirm this spelling — it was typed
    // as "ssweetbabyphotoshop" (double s) in the message this was copied
    // from; using the single-s form here as the far more likely reading,
    // but this needs a yes/no confirmation before relying on it, since a
    // wrong name fails sending exactly like the 132001 error already seen.
    id: "sweetbabyphotoshop",
    label: "אישור הזמנה (5 משתנים)",
    language: "he",
    params: [
      { key: "name", label: "שם הלקוחה" },
      { key: "business", label: "שם העסק (כפי שמוזן בהודעה, למשל Sweet Baby)" },
      { key: "service", label: "השירות/חבילה" },
      { key: "date", label: "תאריך" },
      { key: "time", label: "שעה" },
    ],
  },
];

export function findWhatsAppTemplate(id: string): WhatsAppTemplateDef | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.id === id);
}
