import { heartImg } from "@/lib/email-hearts";
import { buildStudioMailHtml, RB_STUDIO, RB2_STUDIO } from "@/lib/email-draft-design";
import { ARRIVAL_TEXT_HE, STUDIO_ADDRESS_WAZE_HTML } from "@/lib/arrival";
import { hebrewDate } from "@/lib/hebrew-date";
import { emailThumbUrl } from "@/lib/media-url";

/** "2026-08-28 · כ״ח באב תשפ״ו" — the Gregorian date row value with the Hebrew calendar date alongside it, for every confirmation email. */
function dateWithHebrew(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const heb = hebrewDate(isoDate);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return heb ? `${isoDate} · ${heb}` : isoDate;
  const day = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "שבת"][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  const shown = `יום ${day} ${m[3]}.${m[2]}.${m[1]}`;
  return heb ? `${shown} · ${heb}` : shown;
}

// Shared with PayOnlineButton.tsx (the in-site iframe version of the same
// link) — one hosted payment page for both the on-site checkout flow and
// any email that needs to hand a customer a payment link directly (e.g. a
// phone booking, where there's no browser session to send her back to).
export const TAKBULL_PAY_URL = "https://paypage.takbull.co.il/4fk6g";

/** A prominent "pay now" button for emails that can't rely on the customer being on the site (e.g. a phone booking). */
export function buildPaymentButtonHtml(amount: number): string {
  return `<div style="margin:20px 0;text-align:center">
    <a href="${TAKBULL_PAY_URL}" target="_blank" rel="noopener noreferrer"
       class="rb" style="display:inline-block;background:#f5d5cf;background-image:${RB_STUDIO};color:#2d3d2b;border:1px solid #f5d5cf;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">
      לתשלום מאובטח באשראי · ₪${amount}
    </a>
  </div>`;
}

/** The TTLock door passcode, with the "press # to confirm" instruction customers need after keying it in — see integrations/ttlock/client.server.ts. */
export function buildDoorCodeHtml(code: string, extraNote?: string): string {
  return `<div style="margin:20px 0;padding:16px;background:#faf7f4;border-radius:10px;border:1px solid #e8ddd3;text-align:center">
    <p style="margin:0 0 8px;color:#2d3d2b;font-weight:bold;font-size:14px">🔑 קוד כניסה לדלת הסטודיו</p>
    <p style="margin:0 0 8px;font-size:22px;letter-spacing:2px;color:#2d3d2b;font-weight:bold" dir="ltr">${code}</p>
    <p style="margin:0;color:#6b8a63;font-size:13px">תקף רק בשעות ההזמנה שלך. אחרי הקשת הקוד יש ללחוץ על # לאישור.${extraNote ? ` ${extraNote}` : ""}</p>
  </div>`;
}

/** The extra caveat shown only on props/accessories orders — the code doesn't just cover a fixed window, it goes dead overnight. */
const PROPS_DOOR_CODE_NOTE = "הקוד לא פעיל בין 00:00 ל-07:00. אין לקחת או להחזיר אביזרים בלי לתאם טלפונית מראש · 054-8529277.";

/** Shown on a confirmation email only when this specific booking/order actually earned cashback (see awardCashback) — omitted entirely otherwise. Styled as a small celebratory moment, not just another info row. */
export function buildCashbackEarnedHtml(amount: number): string {
  if (!amount || amount <= 0) return "";
  return `<div style="margin:20px 0;padding:20px;background:linear-gradient(135deg,#fdf3ec,#f8e9d8);border-radius:16px;border:1px solid #f0d9b8;text-align:center;box-shadow:0 6px 18px -8px rgba(201,153,74,0.35)">
    <p style="margin:0 0 4px;font-size:26px;line-height:1">🎉✨🎊</p>
    <p style="margin:0 0 2px;color:#6b4f1d;font-size:14px;font-weight:600">צברת קאשבק!</p>
    <p style="margin:0;color:#8a5a12;font-size:32px;font-weight:800;letter-spacing:0.5px">₪${amount.toFixed(0)}</p>
    <p style="margin:6px 0 0;color:#6b8a63;font-size:13px">מההזמנה הזו — זמין לשימוש בהזמנה הבאה שלך ${heartImg("bot")}</p>
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
  ["חדר משפחה", "familyRoom"],
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
  // Stacked (label above value) so it never squeezes into a few letters per line on a phone.
  return `<tr><td style="padding:8px 14px;border-bottom:1px solid #eadfd3"><div style="font-size:12px;color:#6b8a63;font-weight:bold;line-height:1.4">${label}</div><div style="font-size:15px;line-height:1.6">${value}</div></td></tr>`;
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

/**
 * "חדש: חדר משפחה" block for studio-booking mails (owner request 2026-11-12): the family
 * can wait / sit in a designed room with a coffee corner and restrooms during the shoot,
 * no extra charge, subject to availability. Wording adapts to the intake answer
 * (`familyRoom` = "מעוניינת בחדר משפחה …" / "לא מעוניינת …"). Photos are the same two used on
 * the studio page (public/family-room).
 */
/** Entrance + code block (only for a client whose family room was approved). */
export function familyRoomAccessHtml(confirmedSlots?: string | null): string {
  return `<div style="margin-top:10px;padding:10px 12px;background:#eef3ea;border-radius:8px"><strong>החדר אושר עבורך${confirmedSlots?.trim() ? ` בשעות: <bdi dir="ltr">${escapeHtml(confirmedSlots)}</bdi>` : ""}.</strong><br/>כניסה: מהלובי של הבניין, מיד בצד ימין. קוד: <bdi dir="ltr"><strong>${FAMILY_ROOM_DOOR_CODE}</strong></bdi><br/><span style="color:#6b8a63;font-size:13px">החדר שייך לבניין ולא לסטודיו — נא לשמור עליו נקי ולצאת בסיום השעות שאושרו.</span></div>`;
}

/** True when the booked family-room hours cover fewer hours than the studio session (so the mail says "only part of the hours"). Unparseable text => false (we then just list what the owner wrote, never claim more). */
export function familyRoomIsPartial(slots: string, start: string, end: string): boolean {
  const toMin = (t: string) => {
    const m = t.match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const s0 = toMin(String(start));
  const e0 = toMin(String(end));
  if (s0 == null || e0 == null || e0 <= s0) return false;
  const need = Math.ceil((e0 - s0) / 60);
  const range = slots.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (range) {
    const a = toMin(range[1])!;
    const b = toMin(range[2])!;
    return b > a && Math.ceil((b - a) / 60) < need;
  }
  const tokens = slots.match(/\d{1,2}:\d{2}/g) ?? [];
  return tokens.length > 0 && tokens.length < need;
}

/**
 * The mail the client gets right after the owner answers that the family room was booked ("אישור חדר משפחה")
 * or that it could not be booked ("חדר משפחה לא נקבע"). Studio-mail design. Booked: only the approved hours, entrance + code,
 * and a note when it covers just part of the session. Not booked: say so plainly + a "change the date" button.
 */
export function buildFamilyRoomResultHtml(opts: {
  booked: boolean;
  slots?: string | null;
  booking: { id: string; contact_name?: string | null; session_date: string; start_time: string; end_time: string };
}): string {
  const b = opts.booking;
  const name = escapeHtml(b.contact_name ?? "");
  const when = dateWithHebrew(b.session_date);
  if (!opts.booked) {
    return buildStudioMailHtml({
      title: "חדר המשפחה — עדכון",
      innerHtml: `<p>שלום ${name},</p>
      <p>לצערנו <strong>לא הצלחנו לקבוע את חדר המשפחה</strong> לצילום שלך בתאריך ${when} — החדר תפוס. הצילום בסטודיו עצמו נשאר כמתוכנן.</p>
      <p>אם החדר חשוב לך מאוד, אפשר לבחור מועד אחר שבו הוא פנוי:</p>
      <div style="text-align:center;margin:18px 0 6px">${pillButton(chatLinkUrl("reschedule", b.id, b.session_date), "שינוי מועד", true)}</div>
      <p style="color:#6b8a63;font-size:13px">לשאלות: s0548529277@gmail.com / 054-8529277</p>`,
    });
  }
  const slots = (opts.slots ?? "").trim();
  const partial = slots ? familyRoomIsPartial(slots, b.start_time, b.end_time) : false;
  const img = (n: number, alt: string) =>
    `<img src="https://sweetbabyphoto.shop/family-room/family-room-${n}.jpg" alt="${alt}" width="96" height="64" style="width:96px;height:64px;object-fit:cover;border-radius:8px;display:inline-block;margin:2px 0 0 6px" />`;
  return buildStudioMailHtml({
    title: "חדר המשפחה נקבע",
    innerHtml: `<p>שלום ${name},</p>
    <p>${partial ? "קבענו לך את חדר המשפחה <strong>רק בחלק משעות הצילום</strong>" : "קבענו לך את חדר המשפחה"} לצילום בתאריך ${when} — חדר להמתנה בזמן צילום הילד, עם פינת ישיבה, פינת קפה ושירותים.</p>
    ${familyRoomAccessHtml(slots)}
    ${partial ? `<p style="font-size:14px">בשעות האחרות החדר לא פנוי. הצילום בסטודיו נשאר כמתוכנן. אם חשוב לך חדר לכל השעות, אפשר לשנות מועד:</p><div style="text-align:center;margin:10px 0">${pillButton(chatLinkUrl("reschedule", b.id, b.session_date), "שינוי מועד")}</div>` : ""}
    <div style="margin-top:10px">${img(1, "פינת הקפה בחדר המשפחה")}${img(2, "פינת הישיבה בחדר המשפחה")}</div>
    <p style="color:#6b8a63;font-size:13px;margin-top:14px">כתובת הסטודיו: ${STUDIO_ADDRESS_WAZE_HTML} · לשאלות: s0548529277@gmail.com / 054-8529277</p>`,
  });
}

/** Door code of the family room (entrance from the building lobby, immediately on the right). Owner confirmed by message on 2026-11-12: "9531 איקס" (the last character = X; an earlier answer said 9532, her final message corrected it to 9531). */
export const FAMILY_ROOM_DOOR_CODE = "9531X";

export function buildFamilyRoomHtml(payload?: Record<string, string> | null, confirmedSlots?: string | null): string {
  const answer = String(payload?.familyRoom ?? "");
  const wants = answer.startsWith("מעוניינת");
  const declined = answer.startsWith("לא מעוניינת");
  const lead = wants
    ? "ביקשת חדר משפחה — נבדוק זמינות למועד שבחרת ונשלח לך אישור. החדר לפעמים תפוס, ולכן עד שתקבלי אישור אין התחייבות לזמינות."
    : declined
      ? "אם בכל זאת תרצו להשתמש בחדר המשפחה — פשוט כתבי לנו ונבדוק אם הוא פנוי."
      : "אפשר לבקש את חדר המשפחה — פשוט כתבי לנו ונבדוק אם הוא פנוי במועד שלך. אם זה חשוב לך, כדאי לקבל מאיתנו אישור זמינות לפני הצילום.";
  const img = (n: number, alt: string) =>
    `<img src="https://sweetbabyphoto.shop/family-room/family-room-${n}.jpg" alt="${alt}" width="96" height="64" style="width:96px;height:64px;object-fit:cover;border-radius:8px;display:inline-block;margin:2px 0 0 6px" />`;
  return `<h3 style="color:#2d3d2b;margin-top:24px">חדש: חדר משפחה בסטודיו ☕</h3>
    <div style="background:#faf7f4;border-radius:8px;padding:12px 16px;line-height:1.7">
      <p style="margin:0 0 6px">בסטודיו יש חדר משפחה מעוצב — עם פינת ישיבה, <strong>פינת קפה ושירותים</strong> — שבו המשפחה ממתינה בזמן צילום הילד, <strong>ללא תוספת תשלום</strong>. כך אפשר לשבת בנחת ולהתרענן בזמן שהצילומים מתקיימים.</p>
      <p style="margin:0 0 8px">${lead} <span style="color:#6b8a63">(אין התחייבות לזמינות החדר.)</span></p>
      <div>${img(1, "פינת הקפה בחדר המשפחה")}${img(2, "פינת הישיבה בחדר המשפחה")}</div>
      ${confirmedSlots ? familyRoomAccessHtml(confirmedSlots) : ""}
    </div>`;
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
  /** Same SKUs as reserved_items, resolved to name + photo — shown as a thumbnail list instead of a bare SKU string when provided. Falls back to reserved_items' plain "#SKU" list when this is missing (e.g. an item was deleted since). */
  reserved_item_details?: { sku: string; name: string; image_url: string | null }[] | null;
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
  /** Cashback this specific booking earned (see awardCashback) — shown only when > 0. */
  cashbackEarned?: number;
  /** Request-received emails only: direct link back to the page where the customer finishes the order/payment. */
  continueUrl?: string;
  /** Reminder emails: add-props / arrival-directions / change-date buttons. */
  reminderActions?: boolean;
  /** Hours of the family room once it was booked/approved for this client (bookings.family_room_slots) — only then the entrance + code are shown. */
  familyRoomSlots?: string | null;
}): string {
  const { heading, intro, booking, intakePayload, includeArrival = true, includeIntake = true, footerNote, paymentAmount, doorCode, cashbackEarned, continueUrl } = opts;
  const b = booking;
  const balance = b.balance_amount ?? Math.max(0, (b.price ?? 0) - (b.deposit_amount ?? 0));

  const itemsHtml =
    b.reserved_item_details && b.reserved_item_details.length > 0
      ? `<div style="margin:12px 0"><strong>אביזרים ששוריינו:</strong>
          <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px;margin-top:6px">
            ${b.reserved_item_details
              .map(
                (it) =>
                  `<tr>${
                    it.image_url
                      ? `<td style="padding:6px 0 6px 8px;width:44px"><img src="${escapeHtml(emailThumbUrl(it.image_url, 80) ?? "")}" alt="" width="40" height="40" style="width:40px;height:40px;object-fit:cover;border-radius:8px;display:block" /></td>`
                      : ""
                  }<td style="padding:6px 10px">${escapeHtml(it.name)} (${escapeHtml(it.sku)})</td></tr>`,
              )
              .join("")}
          </table>
        </div>`
      : b.reserved_items && b.reserved_items.length > 0
        ? `<p><strong>אביזרים ששוריינו:</strong> ${b.reserved_items.map((s) => `#${s}`).join(", ")}</p>`
        : "";
  const paymentHtml = paymentAmount != null ? buildPaymentButtonHtml(paymentAmount) : "";
  const doorCodeHtml = doorCode ? buildDoorCodeHtml(doorCode) : "";
  const cashbackHtml = cashbackEarned ? buildCashbackEarnedHtml(cashbackEarned) : "";

  return buildStudioMailHtml({ title: heading.replace(/[\s\p{Extended_Pictographic}\u2713\u2714\uFE0F\u200D]+$/u, ""), innerHtml: `
    <p>שלום ${escapeHtml(b.contact_name ?? "")},</p>
    <p>${intro}</p>
    ${isImmediateOrder(b.session_date, b.start_time) ? buildImmediateNoticeHtml() : ""}
    <h3 style="color:#2d3d2b">סיכום הזמנה</h3>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
      <tr><td style="padding:8px 14px;border-bottom:1px solid #eadfd3"><div style="font-size:12px;color:#6b8a63;font-weight:bold;line-height:1.4">מספר הזמנה</div><div style="font-size:20px;font-weight:700;color:#2d3d2b;text-align:right" dir="ltr">#${b.id.slice(0, 8)}</div></td></tr>
      ${row("תאריך", dateWithHebrew(b.session_date))}
      ${row("שעה", `<bdi dir="ltr">${String(b.start_time).slice(0, 5)}–${String(b.end_time).slice(0, 5)}</bdi>`)}
      ${row("מחיר כולל", `₪${b.price}`)}
      ${b.deposit_amount != null ? row(continueUrl || paymentAmount != null ? "מקדמה לתשלום (טרם שולמה)" : "מקדמה ששולמה", `₪${b.deposit_amount}`) : ""}
      ${b.balance_method ? row("אמצעי תשלום", PAYMENT_METHOD_LABELS[b.balance_method] ?? escapeHtml(b.balance_method)) : ""}
      ${row("יתרה לתשלום בסטודיו", `₪${balance}`)}
      ${b.notes ? row("הערות", escapeHtml(String(b.notes))) : ""}
    </table>
    ${cashbackHtml}
    ${itemsHtml}
    ${paymentHtml}
    ${doorCodeHtml}
    ${includeIntake ? buildIntakeHtml(intakePayload) : ""}
    ${includeArrival ? buildFamilyRoomHtml(intakePayload, opts.familyRoomSlots) : ""}
    ${includeArrival ? buildArrivalHtml() : ""}
    ${footerNote ? `<p style="color:#6b8a63;font-size:13px;margin-top:16px">${footerNote}</p>` : ""}
    ${continueUrl ? buildContinueOrderHtml(continueUrl) : ""}
    ${opts.reminderActions ? buildReminderActionsHtml(b.id, b.session_date) : buildEditOrderButtonHtml("booking", b.id)}
    ${buildChatButtonHtml({ kind: "booking", id: b.id, date: b.session_date })}
    <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: ${STUDIO_ADDRESS_WAZE_HTML} · לשאלות: s0548529277@gmail.com / 054-8529277</p>
  ` });
}


// ---------- immediate orders (owner request 2026-11-03) ----------

/**
 * True when the session / pickup is within the next 24 hours (Israel time). Such orders get a phone check from
 * the studio to make sure there is no problem — the customer is told so in the email, on the site and in the chat.
 */
export function isImmediateOrder(date: string | null | undefined, time?: string | null): boolean {
  if (!date) return false;
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const nowTime = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour12: false }).slice(0, 5);
  const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  if (date < today) return false;
  if (date === today) return true;
  if (date === tomorrow) return String(time ?? "00:00").slice(0, 5) <= nowTime;
  return false;
}

export const IMMEDIATE_ORDER_NOTE =
  "ההזמנה בתוך 24 שעות — אנא התקשרי אלינו לוודא שהכול תקין: 054-8529277.";

export function buildImmediateNoticeHtml(): string {
  return `<div style="border:2px solid #c9593f;background:#fff3ee;border-radius:12px;padding:12px 16px;margin:14px 0;color:#2d3d2b;line-height:1.7">
      <strong>📞 ההזמנה בתוך 24 שעות — אנא התקשרי אלינו לוודא שהכול תקין:</strong> <strong dir="ltr">054-8529277</strong>
    </div>`;
}

// ---------- "continue in the chat" buttons (owner request 2026-11-02) ----------

const SITE = "https://sweetbabyphoto.shop";

export type ChatLinkKind = "booking" | "order" | "arrival" | "reschedule" | "props" | "help";

/**
 * Link that opens the site with the bot already open and a first message
 * about this order. Only a short id + date travel in the URL (the ChatBot
 * validates both and builds the sentence itself — nothing free-text).
 */
export function chatLinkUrl(kind: ChatLinkKind, id?: string | null, date?: string | null): string {
  const parts = [kind, (id ?? "").slice(0, 8), (date ?? "").slice(0, 10)];
  return `${SITE}/?chat=${encodeURIComponent(parts.join("."))}`;
}

export function pillButton(href: string, label: string, primary = false): string {
  const bg = "#f5d5cf";
  const fg = "#2d3d2b";
  const grad = `background-image:${primary ? RB_STUDIO : RB2_STUDIO};`;
  return `<a class="${primary ? "rb" : "rb2"}" href="${escapeHtml(href)}" style="background:${bg};${grad}color:${fg};border:1px solid #f5d5cf;padding:10px 20px;border-radius:999px;text-decoration:none;display:inline-block;font-weight:700;font-size:15px;margin:4px">${label}</a>`;
}

/** "להמשיך בצ'אט" — opens the bot with this order's context. */
export function buildChatButtonHtml(opts: { kind: ChatLinkKind; id?: string | null; date?: string | null }): string {
  const url = chatLinkUrl(opts.kind, opts.id, opts.date);
  return `<div style="text-align:center;margin:22px 0 6px">
      <p style="margin:0 0 8px;color:#2d3d2b;font-size:15px">צריכה לשנות, להוסיף או לשאול משהו? נועה, הבוט של הסטודיו, עוזרת בכל שלב ${heartImg("bot")}</p>
      ${pillButton(url, "להמשיך בצ׳אט 💬", true)}
    </div>`;
}

// ---------- "edit order" button (owner request 2026-11-14) ----------

/** Page where the customer edits her own studio booking / props order (login required). */
export function editOrderUrl(kind: "booking" | "order", id: string): string {
  return `${SITE}/edit-order?kind=${kind}&id=${encodeURIComponent(id)}`;
}

/**
 * "עריכת הזמנה" button for every studio-booking and props-order mail. The URL is printed as plain text under it
 * too, because some mail clients strip links/buttons (same reason as buildContinueOrderHtml).
 */
export function buildEditOrderButtonHtml(kind: "booking" | "order", id: string): string {
  const url = editOrderUrl(kind, id);
  return `<div style="text-align:center;margin:22px 0 6px">
      ${pillButton(url, "עריכת הזמנה ✏️", true)}
      <p style="margin:8px 0 0;color:#6b8a63;font-size:12px">שינוי מועד או פרטים. עריכת סטודיו פחות מ-24 שעות לפני המועד טעונה אישור מנהל; באביזרים — בתוך 24 שעות נבקש שתתקשרי אלינו לוודא שהכול תקין.</p>
      <p dir="ltr" style="font-size:11px;margin:4px 0 0;word-break:break-all;color:#8a7f73">${escapeHtml(url)}</p>
    </div>`;
}

/** Reminder-email actions: add props · arrival directions · change the date. */
export function buildReminderActionsHtml(id: string, date: string): string {
  return `<div style="text-align:center;margin:22px 0 6px">
      <p style="margin:0 0 8px;color:#2d3d2b;font-size:15px;font-weight:700">מה אפשר לעשות עכשיו, בלחיצה:</p>
      ${pillButton(editOrderUrl("booking", id), "עריכת הזמנה ✏️", true)}
      ${pillButton(`${SITE}/rental-catalog`, "הוספת אביזרים")}
      ${pillButton(chatLinkUrl("arrival", id, date), "הוראות הגעה")}
      ${pillButton(chatLinkUrl("reschedule", id, date), "שינוי מועד")}
    </div>`;
}

/**
 * "Continue to finish the order" button for request-received emails (before
 * payment), so the customer doesn't have to hunt for the page on the site.
 * The URL is also printed as plain text under it, because some mail clients
 * (the owner's included) strip links/buttons.
 */
export function buildContinueOrderHtml(url: string): string {
  const safe = escapeHtml(url);
  return `<div style="text-align:center;margin:28px 0 8px">
      <a href="${safe}" style="background:#2d3d2b;color:#f8ede4;padding:14px 32px;border-radius:999px;text-decoration:none;display:inline-block;font-weight:700;font-size:17px">להמשך ההזמנה והתשלום ←</a>
      <p style="color:#6b8a63;font-size:12px;margin:12px 0 0">אם הכפתור לא מופיע — אפשר להעתיק את הקישור לדפדפן:</p>
      <p dir="ltr" style="font-size:12px;margin:4px 0 0;word-break:break-all;color:#2d3d2b">${safe}</p>
    </div>`;
}

// ---------- Props/equipment-rental order summary ----------

/** One rented item line, as stored on order_items. */
export type SummaryOrderLine = {
  item_name: string;
  item_sku: string;
  quantity: number;
  price: number; // line total (already ×quantity and ×day-multiplier)
  /** Catalog photo (items.image_url) — shown as a small thumbnail so the item is recognizable at a glance, without having to look up the SKU. Omitted/null just renders no thumbnail. */
  image_url?: string | null;
  /** Short catalog description (items.description), shown under the name. */
  description?: string | null;
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
  /**
   * 24h-rental multiplier applied to every line's price — 1 for a same-day
   * rental, 2+ for a multi-day one (see computeDayMultiplier in
   * orders.functions.ts). Per a direct report that a line's price looked
   * like it had "gone up on its own" with no visible reason: when this is
   * >1, each line below shows the actual "₪X ליום × N ימים = ₪Y" math
   * instead of just the final multiplied number.
   */
  day_multiplier?: number;
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
  /** Cashback this specific order earned (see awardCashback) — shown only when > 0. */
  cashbackEarned?: number;
  /** Request-received emails only: direct link back to the page where the customer finishes the order/payment. */
  continueUrl?: string;
}): string {
  const { heading, intro, order: o, includeArrival = true, footerNote, doorCode, cashbackEarned, continueUrl } = opts;
  const doorCodeHtml = doorCode ? buildDoorCodeHtml(doorCode, PROPS_DOOR_CODE_NOTE) : "";
  const cashbackHtml = cashbackEarned ? buildCashbackEarnedHtml(cashbackEarned) : "";

  const dayMultiplier = o.day_multiplier ?? 1;
  const itemsRows = o.lines
    .map((l) => {
      // l.price is the line TOTAL (already ×quantity and ×day-multiplier)
      // — derive the per-day base price back out for the breakdown so it
      // always matches exactly, rather than re-deriving it independently.
      const basePrice = dayMultiplier > 1 ? l.price / l.quantity / dayMultiplier : null;
      const priceCell =
        basePrice != null
          ? `₪${basePrice.toFixed(0)} ליום × ${dayMultiplier} ימים${l.quantity > 1 ? ` × ${l.quantity}` : ""} = ₪${l.price.toFixed(0)}`
          : `₪${l.price.toFixed(0)}`;
      return `<tr>${
        l.image_url
          ? `<td style="padding:6px 0 6px 8px;width:44px"><img src="${escapeHtml(emailThumbUrl(l.image_url, 80) ?? "")}" alt="" width="40" height="40" style="width:40px;height:40px;object-fit:cover;border-radius:8px;display:block" /></td>`
          : ""
      }<td style="padding:8px 10px;border-bottom:1px solid #eadfd3"><div style="font-size:15px;line-height:1.5">${escapeHtml(l.item_name)}</div><div style="font-size:12px;color:#8a7f73;line-height:1.4">${l.quantity > 1 ? `${l.quantity} יחידות · ` : ""}מק״ט <bdi dir="ltr">${escapeHtml(l.item_sku)}</bdi></div>${l.description ? `<div style="font-size:12px;color:#8a7f73;line-height:1.4">${escapeHtml(l.description)}</div>` : ""}<div style="font-size:13px;color:#6b8a63;line-height:1.5">${priceCell}</div></td></tr>`;
    })
    .join("");

  return buildStudioMailHtml({ title: heading.replace(/[\s\p{Extended_Pictographic}\u2713\u2714\uFE0F\u200D]+$/u, ""), innerHtml: `
    <p>שלום ${escapeHtml(o.contact_name ?? "")},</p>
    <p>${intro}</p>
    ${isImmediateOrder(o.session_date, o.pickup_time) ? buildImmediateNoticeHtml() : ""}
    <h3 style="color:#2d3d2b">סיכום הזמנה</h3>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
      <tr><td style="padding:8px 14px;border-bottom:1px solid #eadfd3"><div style="font-size:12px;color:#6b8a63;font-weight:bold;line-height:1.4">מספר הזמנה</div><div style="font-size:20px;font-weight:700;color:#2d3d2b;text-align:right" dir="ltr">#${o.id.slice(0, 8)}</div></td></tr>
      ${row("איסוף", `${dateWithHebrew(o.session_date)}${o.pickup_time ? ` בשעה ${o.pickup_time}` : ""}`)}
      ${row("החזרה", `${dateWithHebrew(o.return_date)}${o.return_time ? ` בשעה ${o.return_time}` : ""}`)}
      ${o.balance_method ? row("אמצעי תשלום", PAYMENT_METHOD_LABELS[o.balance_method] ?? escapeHtml(o.balance_method)) : ""}
      ${o.notes ? row("הערות", escapeHtml(String(o.notes))) : ""}
    </table>
    <h3 style="color:#2d3d2b;margin-top:24px">פריטים</h3>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">${itemsRows}</table>
    <p style="margin-top:12px"><strong>סה״כ לתשלום:</strong> ₪${o.total}</p>
    <p style="margin-top:16px;padding:12px 16px;background:#fdeceb;border:1px solid #f3c6c2;border-radius:10px;color:#b91c1c;font-weight:600">חובה לדווח לבעלת הסטודיו על כל נזק באביזרים. אין להחזיר אביזר שבור ללא הודעה מראש.</p>
    ${cashbackHtml}
    ${doorCodeHtml}
    ${includeArrival ? buildArrivalHtml() : ""}
    ${footerNote ? `<p style="color:#6b8a63;font-size:13px;margin-top:16px">${footerNote}</p>` : ""}
    ${continueUrl ? buildContinueOrderHtml(continueUrl) : ""}
    ${buildEditOrderButtonHtml("order", o.id)}
    ${buildChatButtonHtml({ kind: "order", id: o.id, date: o.session_date })}
    <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: ${STUDIO_ADDRESS_WAZE_HTML} · לשאלות: s0548529277@gmail.com / 054-8529277</p>
  ` });
}
