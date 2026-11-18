// Owner alert mails for the WhatsApp channel. Sent to the studio inbox only
// (never to a customer), best-effort: a mail failure is logged and never
// fails the webhook delivery.
import { explainWhatsAppFailure, incomingTypeLabel } from "./whatsapp-errors";

const STUDIO_EMAIL = "m0548529277@gmail.com";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** An OUTGOING WhatsApp message failed (async status "failed" from Meta). Mailed once per message — the caller only calls this when the status changes to failed. */
export async function notifyWhatsAppSendFailed(opts: {
  phone: string | null;
  body: string | null;
  errorTitle: string | null;
  errorCode?: number | string | null;
}): Promise<void> {
  try {
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const who = opts.phone && opts.phone !== "unknown" ? opts.phone : "מספר לא ידוע";
    const reason = explainWhatsAppFailure(opts.errorTitle, opts.errorCode);
    const html =
      `<p><strong>הודעת וואטסאפ שיצאה מהאתר לא הגיעה ללקוחה.</strong></p>` +
      `<p>אל: ${esc(who)}</p>` +
      (opts.body ? `<p>ההודעה: "${esc(opts.body.slice(0, 500))}"</p>` : "") +
      `<p>הסיבה: ${esc(reason)}</p>` +
      `<p>אפשר לראות את כל השיחות ב-/admin/whatsapp.</p>`;
    await sendGmail({ to: STUDIO_EMAIL, subject: `⚠️ הודעת וואטסאפ לא נשלחה — ${who}`, html });
  } catch (e) {
    console.error("[SWEETBABY] whatsapp send-failed alert mail failed", e);
  }
}

/** An INCOMING message the bot cannot answer (voice note, photo, sticker, location…). Mailed once — the caller only calls this for a newly stored message. */
export async function notifyWhatsAppNonTextIncoming(opts: {
  phone: string;
  contactName: string | null;
  type: string;
  caption: string | null;
}): Promise<void> {
  try {
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const label = incomingTypeLabel(opts.type);
    const who = opts.contactName ? `${opts.contactName} (${opts.phone})` : opts.phone;
    const html =
      `<p>לקוחה ${esc(who)} שלחה בוואטסאפ <strong>${esc(label)}</strong>.</p>` +
      (opts.caption ? `<p>הכיתוב: "${esc(opts.caption.slice(0, 500))}"</p>` : "") +
      `<p>הבוט עונה רק על הודעות טקסט, ולכן ההודעה הזו נשארה בלי תשובה. אפשר לצפות בה ולהשיב מ-/admin/whatsapp.</p>`;
    await sendGmail({ to: STUDIO_EMAIL, subject: `💬 ${label} בוואטסאפ מחכה לך — ${opts.contactName || opts.phone}`, html });
  } catch (e) {
    console.error("[SWEETBABY] whatsapp non-text alert mail failed", e);
  }
}
