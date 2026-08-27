import { ARRIVAL_TEXT_HE } from "@/lib/arrival";

// Shared with PayOnlineButton.tsx (the in-site iframe version of the same
// link) — one hosted payment page for both the on-site checkout flow and
// any email that needs to hand a customer a payment link directly (e.g. a
// phone booking, where there's no browser session to send her back to).
export const TAKBULL_PAY_URL = "https://paypage.takbull.co.il/4fk6g";

/** A prominent "pay now" button for emails that can't rely on the customer being on the site (e.g. a phone booking). */
export function buildPaymentButtonHtml(amount: number): string {
  return `<div style="margin:20px 0;text-align:center">
    <a href="${TAKBULL_PAY_URL}" target="_blank" rel="noopener noreferrer"
       style="display:inline-block;background:#2d3d2b;color:#f8ede4;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">
      לתשלום מאובטח באשראי · ₪${amount}
    </a>
  </div>`;
}

/** The TTLock door passcode, with the "press # to confirm" instruction customers need after keying it in — see integrations/ttlock/client.server.ts. */
export function buildDoorCodeHtml(code: string): string {
  return `<div style="margin:20px 0;padding:16px;background:#faf7f4;border-radius:10px;border:1px solid #e8ddd3;text-align:center">
    <p style="margin:0 0 8px;color:#2d3d2b;font-weight:bold;font-size:14px">🔑 קוד כניסה לדלת הסטודיו</p>
    <p style="margin:0 0 8px;font-size:28px;letter-spacing:4px;color:#2d3d2b;font-weight:bold" dir="ltr">${code}</p>
    <p style="margin:0;color:#6b8a63;font-size:13px">תקף רק בשעות ההזמנה שלך. אחרי הקשת הקוד יש ללחוץ על # לאישור.</p>
  </div>`;
}

/**
 * Maps the raw studio-intake questionnaire payload (studio_intake_forms.payload)
 * to Hebrew labels, in display order. Shared so every email that shows the
 * questionnaire renders it identically.
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

/** How a customer paid: shared across studio-booking and props-order emails. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: "העברה בנקאית",
  bit: "Bit / PayBox",
  card: "אשראי (תשלום מאובטח באתר)",
  cash: "מזומן",
};

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
    )}</div>
    <p style="color:#6b8a63;font-size:13px;margin-top:8px">נא לתאם טלפונית לפני ההגעה · 054-8529277</p>`;
}

// ---------- Studio-booking summary ----------

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

/**
 * Builds the full HTML body for a studio-booking email: greeting, a
 * complete price/date/time table (incl. chosen payment method once known),
 * the reserved-items list (if any), the full intake questionnaire (if
 * available), and the arrival directions. Every booking email
 * (request-received / reservation-confirmed / reminder) renders from this
 * single function so they never drift out of sync.
 */
export function buildBookingSummaryHtml(opts: {
  heading: string;
  intro: string;
  booking: SummaryBooking;
  intakePayload?: Record<string, string> | null;
  includeArrival?: boolean;
  includeIntake?: boolean;
  footerNote?: string;
  /** Amount to show on an embedded "pay now" button — used for bookings made outside a browser session (phone), where there's no /deposit page to send her back to. */
  paymentAmount?: number;
  /** TTLock door passcode, once issued — see integrations/ttlock/client.server.ts. */
  doorCode?: string | null;
}): string {
  const { heading, intro, booking, intakePayload, includeArrival = true, includeIntake = true, footerNote, paymentAmount, doorCode } = opts;
  const b = booking;
  const balance = b.balance_amount ?? Math.max(0, (b.price ?? 0) - (b.deposit_amount ?? 0));

  const itemsHtml =
    b.reserved_items && b.reserved_items.length > 0
      ? `<p><strong>אביזרים ששוריינו:</strong> ${b.reserved_items.map((s) => `#${s}`).join(", ")}</p>`
      : "";
  const paymentHtml = paymentAmount != null ? buildPaymentButtonHtml(paymentAmount) : "";
  const doorCodeHtml = doorCode ? buildDoorCodeHtml(doorCode) : "";

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
    ${paymentHtml}
    ${doorCodeHtml}
    ${includeIntake ? buildIntakeHtml(intakePayload) : ""}
    ${includeArrival ? buildArrivalHtml() : ""}
    ${footerNote ? `<p style="color:#6b8a63;font-size:13px;margin-top:16px">${footerNote}</p>` : ""}
    <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: s0548529277@gmail.com / 054-8529277</p>
  </div>`;
}

// ---------- Props/equipment-rental order summary ----------

/** One rented item line, as stored on order_items. */
export type SummaryOrderLine = {
  item_name: string;
  item_sku: string;
  quantity: number;
  price: number; // line total (already ×quantity and ×day-multiplier)
};

export type SummaryOrder = {
  id: string;
  contact_name?: string | null;
  session_date: string; // pickup date
  pickup_time?: string | null;
  return_date: string;
  return_time?: string | null;
  total: number;
  notes?: string | null;
  /** How the customer paid: "transfer" | "bit" | "card" | "cash". */
  balance_method?: string | null;
  lines: SummaryOrderLine[];
};

/**
 * Builds the full HTML body for a props/equipment-rental order email:
 * greeting, pickup/return date+time, the full item list with prices,
 * payment method (once chosen), and arrival directions.
 */
export function buildPropsOrderSummaryHtml(opts: {
  heading: string;
  intro: string;
  order: SummaryOrder;
  includeArrival?: boolean;
  footerNote?: string;
  /** TTLock door passcode, once issued — see integrations/ttlock/client.server.ts. */
  doorCode?: string | null;
}): string {
  const { heading, intro, order: o, includeArrival = true, footerNote, doorCode } = opts;
  const doorCodeHtml = doorCode ? buildDoorCodeHtml(doorCode) : "";

  const itemsRows = o.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 10px">${escapeHtml(l.item_name)} (${escapeHtml(l.item_sku)})</td><td style="padding:6px 10px;text-align:center">×${l.quantity}</td><td style="padding:6px 10px;text-align:left">₪${l.price.toFixed(0)}</td></tr>`,
    )
    .join("");

  return `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
    <h2 style="color:#2d3d2b">${escapeHtml(heading)}</h2>
    <p>שלום ${escapeHtml(o.contact_name ?? "")},</p>
    <p>${intro}</p>
    <h3 style="color:#2d3d2b">סיכום הזמנה</h3>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
      <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>מספר הזמנה</strong></td><td style="padding:6px 10px" dir="ltr">#${o.id.slice(0, 8)}</td></tr>
      ${row("איסוף", `${o.session_date}${o.pickup_time ? ` בשעה ${o.pickup_time}` : ""}`)}
      ${row("החזרה", `${o.return_date}${o.return_time ? ` בשעה ${o.return_time}` : ""}`)}
      ${o.balance_method ? row("אמצעי תשלום", PAYMENT_METHOD_LABELS[o.balance_method] ?? escapeHtml(o.balance_method)) : ""}
      ${o.notes ? row("הערות", escapeHtml(String(o.notes))) : ""}
    </table>
    <h3 style="color:#2d3d2b;margin-top:24px">פריטים</h3>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">${itemsRows}</table>
    <p style="margin-top:12px"><strong>סה״כ לתשלום:</strong> ₪${o.total}</p>
    ${doorCodeHtml}
    ${includeArrival ? buildArrivalHtml() : ""}
    ${footerNote ? `<p style="color:#6b8a63;font-size:13px;margin-top:16px">${footerNote}</p>` : ""}
    <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: s0548529277@gmail.com / 054-8529277</p>
  </div>`;
}
