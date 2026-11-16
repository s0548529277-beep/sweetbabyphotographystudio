// Shared (client + server) studio newsletter template. The admin edits these fields each time; the HTML is always
// rendered in the studio mail look (thick gradient frame, Sweetbaby logo, studio signature + buttons), so nothing needs designing.
// Ported from the photographer site's newsletter (same fields, same flow).
import { buildStudioMailHtml, esc } from "@/lib/email-draft-design";

export type NewsletterDraft = {
  subject: string;
  headline: string;
  intro: string;
  body: string;
  imageUrl: string;
  buttonText: string;
  buttonUrl: string;
};

export const NEWSLETTER_DRAFT_KEY = "studio_newsletter_draft";
export const UNSUB_PLACEHOLDER = "{{UNSUB_URL}}";
const SITE = "https://sweetbabyphoto.shop";

export const DEFAULT_NEWSLETTER_DRAFT: NewsletterDraft = {
  subject: "חדש בסטודיו של Sweetbaby 💗",
  headline: "שמחות שאת כאן",
  intro: "כמה מילים קצרות על מה שחדש אצלנו בסטודיו.",
  body: "כאן כותבים את תוכן הניוזלטר.\nשורה חדשה = פסקה חדשה.",
  imageUrl: "",
  buttonText: "לאתר הסטודיו",
  buttonUrl: `${SITE}/studio-rental`,
};

const INK = "#2d3d2b";
const MUTED = "#6b5b53";

const paragraphs = (s: string) =>
  s
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:${INK}">${esc(p)}</p>`)
    .join("");

/** `unsubUrl` defaults to a placeholder that is swapped per recipient at send time. */
export function renderNewsletterHtml(d: NewsletterDraft, unsubUrl: string = UNSUB_PLACEHOLDER): string {
  const image = d.imageUrl.trim()
    ? `<p style="margin:0 0 16px;text-align:center"><img src="${esc(d.imageUrl.trim())}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:16px;margin:0 auto"></p>`
    : "";
  const button =
    d.buttonText.trim() && d.buttonUrl.trim()
      ? `<p style="margin:22px 0 8px;text-align:center"><a href="${esc(d.buttonUrl.trim())}" style="display:inline-block;background:linear-gradient(135deg,#f5d5cf,#f5d5cf 45%,#d8ddca);color:${INK};border:1px solid #d9b9b0;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:12px 34px;border-radius:999px">${esc(d.buttonText.trim())}</a></p>`
      : "";
  const intro = d.intro.trim()
    ? `<p style="margin:0 0 16px;font-size:17px;line-height:1.8;color:${MUTED}">${esc(d.intro)}</p>`
    : "";
  const footer = `<p style="margin:22px 0 0;padding-top:12px;border-top:1px solid #efddd0;font-size:12px;line-height:1.7;color:${MUTED};text-align:center">קיבלת מייל זה כי הצטרפת לרשימת התפוצה של Sweetbaby. <a href="${unsubUrl}" style="color:${MUTED};text-decoration:underline">להסרה מהרשימה</a></p>`;
  return buildStudioMailHtml({ title: d.headline, innerHtml: `${image}${intro}${paragraphs(d.body)}${button}${footer}` });
}
