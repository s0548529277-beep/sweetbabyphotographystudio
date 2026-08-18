import { ARRIVAL_TEXT_HE } from "@/lib/arrival";

/**
 * Maps the raw studio-intake questionnaire payload (studio_intake_forms.payload)
 * to Hebrew labels, in display order. Shared so every email that shows the
 * questionnaire (booking-request email, reservation-confirmed email, and any
 * future email) renders it identically.
 */
export const INTAKE_LABELS: Array<[label: string, key: string]> = [
  ["שם מלא", "clientName"],
  ["טלפון", "phone"],
  ["אימייל", "email"],
  ["סוג הצילום", "sessionType"],
  ["מספר משתתפים", "peopleCount"],
  ["גיל התינוק", "babyAge"],
  ["מותג מצלמה", "cameraBrand"],
  ["ניסיון פלאש/סטודיו", "flashExperience"],
  ["אביזרים בהשכרה", "needProps"],
  ["בקשות מיוחדות", "specialRequests"],
];

function escapeHtml(value: string): string {
  return value.replace(/</g, "&lt;");
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>${label}</strong></td><td style="padding:6px 10px">${value}</td></tr>`;
}

export function buildIntakeHtml(payload: Record<string, string> | null | undefined): string {
  if (!payload) return "";
  const rows = INTAKE_LABELS.filter(([, k]) => payload[k] && String(payload[k]).trim().length > 0)
    .map(([label, k]) => row(label, escapeHtml(String(payload[k]))))
    .join("");
  if (!rows) return "";
  return `<h3 style="color:#2d3d2b;margin-top:24px">שאלון תיאום ציפיות</h3>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">${rows}</table>
    <p style="font-size:12px;color:#6b8a63">הלקוחה אישרה שקראה והסכימה לכללי הסטודיו: מחירון וחישוב שעות, מדיניות ביטולים, ניקיון, אחריות ונזקים.</p>`;
}

export function buildArrivalHtml(): string {
  return `<h3 style="color:#2d3d2b;margin-top:24px">פרטי הגעה</h3>
    <div style="background:#faf7f4;border-radius:8px;padding:12px 16px;white-space:pre-line;line-height:1.6">${escapeHtml(
      ARRIVAL_TEXT_HE,
    )}</div>`;
}

export type SummaryBooking = {
  id: string;
  contact_name?: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  price: number;
  deposit_amount?: number | null;
  balance_amount?: number | null;
  notes?: string | null;
  reserved_items?: string[] | null;
  /** How the customer paid the deposit: "transfer" | "bit" | "card" | "cash". */
  balance_method?: string | null;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: "העברה בנקאית",
  bit: "Bit / PayBox",
  card: "אשראי (תשלום מאובטח באתר)",
  cash: "מזומן",
};

/**
 * Builds the full HTML body for a booking-related email: greeting, a
 * complete price/date/time table, the reserved-items list (if any), the
 * full intake questionnaire (if available), and the arrival directions.
 * Every booking email (request-received / reservation-confirmed / reminder)
 * renders from this single function so they never drift out of sync.
 */
export function buildBookingSummaryHtml(opts: {
  heading: string;
  intro: string;
  booking: SummaryBooking;
  intakePayload?: Record<string, string> | null;
  includeArrival?: boolean;
  includeIntake?: boolean;
  footerNote?: string;
}): string {
  const { heading, intro, booking, intakePayload, includeArrival = true, includeIntake = true, footerNote } = opts;
  const b = booking;
  const balance = b.balance_amount ?? Math.max(0, (b.price ?? 0) - (b.deposit_amount ?? 0));

  const itemsHtml =
    b.reserved_items && b.reserved_items.length > 0
      ? `<p><strong>אביזרים ששוריינו:</strong> ${b.reserved_items.map((s) => `#${s}`).join(", ")}</p>`
      : "";

  return `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
    <h2 style="color:#2d3d2b">${escapeHtml(heading)}</h2>
    <p>שלום ${escapeHtml(b.contact_name ?? "")},</p>
    <p>${intro}</p>
    <h3 style="color:#2d3d2b">סיכום הזמנה</h3>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
      <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>מספר הזמנה</strong></td><td style="padding:6px 10px" dir="ltr">#${b.id.slice(0, 8)}</td></tr>
      ${row("תאריך", b.session_date)}
      ${row("שעה", `${String(b.start_time).slice(0, 5)} - ${String(b.end_time).slice(0, 5)}`)}
      ${row("מחיר כולל", `₪${b.price}`)}
      ${b.deposit_amount != null ? row("מקדמה ששולמה", `₪${b.deposit_amount}`) : ""}
      ${b.balance_method ? row("אמצעי תשלום", PAYMENT_METHOD_LABELS[b.balance_method] ?? escapeHtml(b.balance_method)) : ""}
      ${row("יתרה לתשלום בסטודיו", `₪${balance}`)}
      ${b.notes ? row("הערות", escapeHtml(String(b.notes))) : ""}
    </table>
    ${itemsHtml}
    ${includeIntake ? buildIntakeHtml(intakePayload) : ""}
    ${includeArrival ? buildArrivalHtml() : ""}
    ${footerNote ? `<p style="color:#6b8a63;font-size:13px;margin-top:16px">${footerNote}</p>` : ""}
    <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: s0548529277@gmail.com / 054-8529277</p>
  </div>`;
}
