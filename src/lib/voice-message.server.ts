// Fixed marker passed as `context` by the props-only phone-request tool
// (voice-chat.server.ts's request_props_rental) — baked into that tool's own
// code rather than typed freehand by the model each time, so
// notifyPendingPropsRequests (bookings.functions.ts) can reliably find these
// rows later for the reminder-call escalation. Same idea as
// PHONE_BOOKING_NOTES_MARKER letting notifyPendingPhoneBookingConfirmations
// find phone studio bookings by their notes field.
export const PROPS_REQUEST_CONTEXT_MARKER = 'בקשת השכרת אביזרים טלפונית (ללא שריון סטודיו) — השריון בפועל יבוצע ע"י מנהל הסטודיו';

// Sends a phone caller's spoken message to the studio — used by menu option
// 6 ("להשאיר הודעה") and as the fallback whenever the bot would otherwise
// just say "the studio will call you back" (no human available to transfer
// to, a booking/availability tool failed, an unexpected error). The whole
// point is that a promised callback actually leaves a trace: this always
// writes to admin_notifications first (shows up in the admin — never lost
// even if the inbox fails) and only then attempts the email on top, so a
// Gmail hiccup can't make the message vanish.
export async function sendMessageToStudio(opts: {
  message: string;
  callerPhone: string;
  contactName?: string | null;
  /** Short context for the studio, e.g. "מהתפריט הראשי" / "הבוט לא הצליח להעביר לנציגה" / "יצירת שריון נכשלה". */
  context?: string | null;
}): Promise<{ ok: boolean; emailed: boolean }> {
  const { message, callerPhone, contactName, context } = opts;
  let savedToAdmin = false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_notifications").insert({
      type: "voice_message",
      title: `הודעה מלקוחה בטלפון${contactName ? " · " + contactName : ""} · ${callerPhone}`,
      body: { message, phone: callerPhone, contact_name: contactName ?? null, context: context ?? null },
    });
    if (error) throw error;
    savedToAdmin = true;
  } catch (e) {
    console.error("[SWEETBABY] voice message admin_notifications save failed", e);
  }

  let emailed = false;
  try {
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
      <h2 style="color:#2d3d2b">הודעה מלקוחה בטלפון 📞</h2>
      <p><strong>מספר טלפון:</strong> <span dir="ltr">${callerPhone || "לא זוהה"}</span></p>
      ${contactName ? `<p><strong>שם:</strong> ${contactName}</p>` : ""}
      ${context ? `<p><strong>הקשר:</strong> ${context}</p>` : ""}
      <h3 style="color:#2d3d2b;margin-top:16px">ההודעה:</h3>
      <p style="background:#faf7f4;border-radius:8px;padding:12px 16px;white-space:pre-line">${message}</p>
    </div>`;
    emailed = await sendGmail({
      to: "s0548529277@gmail.com",
      subject: `📞 הודעה מלקוחה בטלפון · ${callerPhone || "מספר לא ידוע"}`,
      html,
    });
    if (!emailed) console.error("[SWEETBABY] voice message email send returned false", callerPhone);
  } catch (e) {
    console.error("[SWEETBABY] voice message email failed", e);
  }

  return { ok: savedToAdmin || emailed, emailed };
}
