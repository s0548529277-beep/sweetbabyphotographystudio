import { z } from "zod";

/**
 * Questions the client answers on the contract signing page, together with
 * ticking "קראתי" on every section (owner request 2026-10-26, modelled on a
 * Google Form she liked). Shared by the page (client) and the confirm
 * server functions; stored as jsonb in <table>.contract_answers.
 */

export const PUBLISH_OPTIONS = [
  "אין לי בעיה",
  "מאשרת, אך לא כולל הדפסה בעיתונים",
  "מעדיפה שלא",
  "אחר",
] as const;

export const PAYMENT_OPTIONS = ["מעבירה", "אתן במזומן ביום הצילומים"] as const;

export const contractAnswersSchema = z
  .object({
    children: z.string().trim().min(2, "יש למלא את פרטי הילדים").max(1000),
    publish: z.enum(PUBLISH_OPTIONS),
    publishOther: z.string().trim().max(500).optional().default(""),
    payment: z.enum(PAYMENT_OPTIONS),
    notes: z.string().trim().max(2000).optional().default(""),
  })
  .refine((a) => a.publish !== "אחר" || a.publishOther.length > 0, {
    message: "יש לפרט באישור הפרסום",
    path: ["publishOther"],
  });

export type ContractAnswers = z.infer<typeof contractAnswersSchema>;

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
}

/** The answers block for the studio's "she confirmed the contract" email. */
export function contractAnswersEmailHtml(a: ContractAnswers): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 8px;font-weight:600;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:6px 8px">${value}</td></tr>`;
  const publish = a.publish === "אחר" ? `אחר: ${esc(a.publishOther)}` : esc(a.publish);
  return `<table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:13px;background:#fff;border-radius:12px">
    ${row("פרטי הילדים", esc(a.children))}
    ${row("אישור פרסום", publish)}
    ${row("יתרת התשלום", esc(a.payment))}
    ${a.notes ? row("עוד משהו", esc(a.notes)) : ""}
  </table>`;
}
