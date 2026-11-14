/**
 * Shared look of the contract mails (newborn / outdoor / photo), following the
 * PDF contract the owner prefers (2026-11-14): bold dark-brown headings,
 * grey-brown body text, a thin cream divider between sections (no heart).
 * Also holds the "rights and publishing" section shown in every contract.
 */
import { PUBLISH_OPTIONS } from "@/lib/contract-answers";

export const CONTRACT_FONT = "'Century Gothic','Avenir Next',Montserrat,Verdana,Arial,sans-serif";
export const CONTRACT_HEAD = "#3e3029";
export const CONTRACT_TEXT = "#6b5d55";
export const CONTRACT_LINE = "#e3d6c4";

export function contractHeadingStyle(): string {
  return `margin:0 0 8px;color:${CONTRACT_HEAD};font-size:19px;line-height:1.4;font-weight:800;font-family:${CONTRACT_FONT};`;
}

export function contractBodyStyle(): string {
  return `color:${CONTRACT_TEXT};font-size:14px;line-height:1.9;font-family:${CONTRACT_FONT};`;
}

/** One contract section as two table rows: heading + body, then a thin divider. */
export function contractSectionRows(title: string, bodyHtml: string): string {
  return `
    <tr><td style="padding:20px 0 0">
      <h3 style="${contractHeadingStyle()}">${title}</h3>
      <div style="${contractBodyStyle()}">${bodyHtml}</div>
    </td></tr>
    <tr><td style="padding:16px 0 0"><div style="border-top:1px solid ${CONTRACT_LINE};line-height:0;font-size:0;height:0">&nbsp;</div></td></tr>`;
}

export const PUBLISH_SECTION_TITLE = "זכויות ואישור פרסום";

/** Body of the rights + publishing section; the choice itself is made on the signing page. */
export function publishSectionBodyHtml(): string {
  const choices = PUBLISH_OPTIONS.map((o) => `<li style="margin:2px 0">${o}</li>`).join("");
  return `<p style="margin:6px 0">זכויות היוצרים בתמונות שמורות לצלמת. התמונות מיועדות לשימוש אישי של המשפחה, ואין להעביר אותן לצד שלישי או להשתמש בהן מסחרית ללא אישור מראש.</p>
    <p style="margin:6px 0">אשמח לפרסם חלק מהתמונות באתר וברשתות. את הבחירה שלך את מסמנת בדף האישור, באחת האפשרויות:</p>
    <ul style="margin:6px 0;padding-inline-start:20px">${choices}</ul>`;
}
