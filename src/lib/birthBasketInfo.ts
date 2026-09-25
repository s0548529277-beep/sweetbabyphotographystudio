/**
 * The auto-reply email sent to whoever clicks "מעוניינת במימוש סל לידה" on
 * /newborn and leaves her contact details (see requestBirthBasketInterest
 * in newborn-orders.functions.ts). Same admin-editable-plain-text pattern
 * as newbornContract.ts's DEFAULT_NEWBORN_CONTRACT_TEMPLATE — a single big
 * text box (app_settings, key BIRTH_BASKET_TEMPLATE_KEY — see
 * /admin/birth-basket-text), not raw HTML, so a non-technical edit can
 * never break the page's markup. Photos are managed separately, via
 * /admin/gallery's "סל לידה" tab (PAGE_IMAGE_KEYS.birthBasket) — this file
 * only lays them out once fetched.
 *
 * Format (same as newbornContract.ts, kept identical on purpose so an
 * admin who already knows one editor knows both):
 * - A line starting with "## " starts a new section (its own heading).
 * - Blank lines separate paragraphs within a section.
 * - A block whose every line starts with "- " renders as a bullet list.
 * - {{token}} placeholders are substituted before parsing — see
 *   BirthBasketVars below for the exact set.
 */
import michalWordmark from "@/assets/michal-logo-wordmark.png";

const WORDMARK_URL = `https://sweetbabyphoto.shop${michalWordmark}`;
const ROSE = "#c23b6d";
const BROWN = "#5a4433";
const BROWN_SOFT = "#8a6a52";
const CREAM = "#f6f0e4";
const BORDER = "#a9784f";
const STUDIO_ADDRESS = "כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש";

export const BIRTH_BASKET_TEMPLATE_KEY = "birth_basket_info_template";

export type BirthBasketVars = {
  contact_name: string;
  album_line: string;
};

export const DEFAULT_BIRTH_BASKET_TEMPLATE = `היי {{contact_name}} היקרה,
תודה שפנית! שמחה מאוד שאת שוקלת למַמֵש את סל הלידה שלך אצלי בסטודיו — הנה כל הפרטים במקום אחד.

## מה זה בעצם סל לידה?
קופות החולים מעניקות לכל יולדת שובר/תקציב למימוש אצל ספקים מאושרים — צילומי ניו-בורן הם אחת האפשרויות הכי אהובות, וזו הזדמנות מעולה להנציח את הימים הראשונים של התינוק/ת ללא עלות נוספת (או בתוספת קטנה, בהתאם לשווי השובר והחבילה שתבחרי).

## החבילות שלי למימוש סל לידה
- חבילת מיני — סשן קצר בסטודיו, כמה תמונות ערוכות דיגיטליות
- חבילת פינוק — סשן מלא, עיבוד מקצועי לכל התמונות שנבחרו
- חבילת פרימיום — סשן מלא + אלבום מודפס איכותי

מחירים מדויקים ומה בדיוק כלול בכל חבילה — נעדכן בשיחה קצרה, בהתאם לשווי השובר שלך ולצרכים שלך.

## אלבום מודפס
{{album_line}}

## איך ממשיכים מכאן?
אחזור אלייך בהקדם האפשרי בטלפון או במייל לתיאום שיחה קצרה, ואז נקבע תאריך לסשן בסטודיו הבוטיק שלי בבית שמש.

מחכה ממש להכיר ולתעד לכם רגעים מרגשים 💗
מיכל`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Renders one section's plain-text body into paragraphs/bullet lists — same minimal markup as newbornContract.ts's renderBody. */
function renderBody(bodyText: string): string {
  const blocks = bodyText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
      if (isList) {
        const items = lines
          .map((l) => `<li style="margin:2px 0">${escapeHtml(l.slice(2))}</li>`)
          .join("");
        return `<ul style="margin:6px 0;padding-inline-start:20px">${items}</ul>`;
      }
      return `<p style="margin:6px 0">${lines.map(escapeHtml).join("<br/>")}</p>`;
    })
    .join("");
}

/** Substitutes every {{token}} with its value from vars (missing tokens left as-is, so a typo'd token is visible rather than silently vanishing). */
export function fillBirthBasketPlaceholders(template: string, vars: BirthBasketVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value !== undefined ? value : match;
  });
}

/**
 * Parses the (already placeholder-filled) template text into the final
 * branded email HTML, optionally with a small photo strip up top (2-4
 * photos from /admin/gallery's "סל לידה" tab) — same rose/brown/cream
 * palette as newbornContract.ts's renderNewbornContractHtml, kept
 * email-safe (inline styles only, no external stylesheet).
 */
export function renderBirthBasketHtml(filledTemplate: string, photoUrls: string[] = []): string {
  const rawSections = filledTemplate.split(/\n##\s+/);
  const intro = rawSections[0]?.trim() ?? "";
  const sections = rawSections.slice(1).map((raw) => {
    const newlineIdx = raw.indexOf("\n");
    const title = (newlineIdx === -1 ? raw : raw.slice(0, newlineIdx)).trim();
    const body = newlineIdx === -1 ? "" : raw.slice(newlineIdx + 1).trim();
    return { title, body };
  });

  const sectionHtml = sections
    .map(
      (s) => `
    <tr><td style="padding:22px 0 0">
      <h3 style="margin:0 0 8px;color:${ROSE};font-size:17px;font-weight:bold">${escapeHtml(s.title)}</h3>
      <div style="color:${BROWN};font-size:14px;line-height:1.9">${renderBody(s.body)}</div>
    </td></tr>
    <tr><td style="padding:16px 0 0">
      <div style="border-top:1px solid ${BORDER}55;position:relative;text-align:center">
        <span style="position:relative;top:-9px;background:${CREAM};padding:0 10px;color:${ROSE};font-size:12px">♥</span>
      </div>
    </td></tr>`,
    )
    .join("");

  const photos = photoUrls.slice(0, 4);
  const photoStripHtml = photos.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px"><tr>${photos
        .map(
          (src) =>
            `<td width="${Math.floor(100 / photos.length)}%" style="padding:3px"><img src="${src}" alt="" width="140" style="width:100%;height:110px;object-fit:cover;border-radius:10px;display:block" /></td>`,
        )
        .join("")}</tr></table>`
    : "";

  return `<div dir="rtl" style="font-family:Arial,sans-serif;color:${BROWN};max-width:600px;margin:0 auto">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BORDER};padding:14px 0">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CREAM};border-radius:4px">
          <tr><td style="padding:34px 34px 10px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:18px">
              <img src="${WORDMARK_URL}" alt="Michal" height="46" style="height:46px;width:auto" />
            </td></tr></table>
            <h2 style="margin:0 0 10px;color:${ROSE};font-size:22px;text-align:center">🧺 מימוש סל לידה — כל הפרטים</h2>
            ${photoStripHtml}
            <div style="color:${BROWN};font-size:14px;line-height:1.9">${renderBody(intro)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionHtml}</table>
            <p style="margin-top:20px;color:${BROWN_SOFT};font-size:13px;text-align:center">${STUDIO_ADDRESS}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}
