// Price-quote templates Michal sends to clients (admin → "הצעות מחיר"). The price/contents always come from
// newborn-packages.ts, so changing the package there changes the quote. Rendered server-side only (the admin page
// shows the HTML in a frame) so the mail and the preview are the same thing.
import { findNewbornPackage } from "@/lib/newborn-packages";
import { buildBrandedMailHtml, esc } from "@/lib/email-draft-design";

export const QUOTE_CATEGORY = "הצעת מחיר";

export type QuoteTemplateId = "mini_studio";
export const QUOTE_TEMPLATES: Array<{ id: QuoteTemplateId; label: string; subject: string }> = [
  { id: "mini_studio", label: "חבילת מיני — הצעה לצילום בסטודיו", subject: "הצעת מחיר לצילום בסטודיו · MICHAL SIBONI" },
];

export function isQuoteTemplateId(v: unknown): v is QuoteTemplateId {
  return QUOTE_TEMPLATES.some((t) => t.id === v);
}

const ILS = (n: number) => `${n.toLocaleString("en-US")}₪`;

export function buildQuote(id: QuoteTemplateId, clientName: string): { subject: string; html: string } {
  const tpl = QUOTE_TEMPLATES.find((t) => t.id === id)!;
  const pkg = findNewbornPackage("mini_studio");
  if (!pkg) throw new Error("החבילה לא נמצאה");
  const name = clientName.trim();
  const lines = [`${pkg.sets} סטים`, `${pkg.photosToEdit} תמונות מעובדות`, ...(pkg.hasCollage ? ["קולאז׳ מעוצב"] : [])];
  const inner = `<p style="margin:0 0 10px">${name ? `שלום ${esc(name)},` : "שלום,"}</p>
    <p style="margin:0 0 14px">שמחה על הפנייה! מצורפת הצעת המחיר לצילום בסטודיו הבוטיק שלנו בבית שמש.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 14px;background:#ffffff;border:2px solid #c98a86;border-radius:16px">
      <tr><td style="padding:18px 16px 6px;text-align:center">
        <div style="font-size:12px;letter-spacing:2px;color:#8a6a52;margin-bottom:4px">הצעה לצילום בסטודיו</div>
        <div style="font-size:20px;font-weight:bold;color:#3e3029">חבילת מיני</div>
        <div style="height:2px;width:44px;background:#a9784f;margin:10px auto"></div>
        ${lines.map((l) => `<div style="font-size:15px;color:#3e3029;line-height:1.9">${esc(l)}</div>`).join("")}
      </td></tr>
      <tr><td style="padding:10px 16px 18px;text-align:center">
        <span style="display:inline-block;background:#8a6a52;color:#ffffff;font-weight:bold;font-size:20px;padding:7px 26px;border-radius:24px">${esc(ILS(pkg.price))}</span>
      </td></tr>
    </table>
    <p style="margin:0 0 10px">לקביעת מועד או לכל שאלה — פשוט להשיב למייל הזה.</p>
    <p style="margin:0">מחכה לראות אתכם 🤍</p>`;
  return { subject: tpl.subject, html: buildBrandedMailHtml({ title: "הצעת מחיר", innerHtml: inner, tagline: "צילומי ניו בורן ומשפחה · סטודיו בוטיק בבית שמש" }) };
}
