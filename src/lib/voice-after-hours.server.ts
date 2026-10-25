/**
 * Phone-bot quiet hours (owner request 2026-10-25): from 22:00 until 08:00
 * Israel time, a NEW incoming call hears one fixed message and is hung up —
 * no menu, no AI, no booking. Applies to both phone channels (Yemot IVR and
 * Twilio). A call that already started before 22:00 is NOT cut off: the Yemot
 * route only applies this when no voice_call_sessions row exists yet for the
 * call, and Twilio's /api/voice/incoming is by definition a new call.
 * The website chatbot is NOT affected (owner chose the phone bot only).
 */
export const AFTER_HOURS_START = 22; // inclusive, 22:00
export const AFTER_HOURS_END = 8; // exclusive, 08:00

export const AFTER_HOURS_MESSAGE =
  "שלום, הגעת לסטודיו סוויט בייבי. כרגע אין מענה. אפשר לחזור אלינו מחר מ-8:00 בבוקר.";

/** Current hour (0–23) in Asia/Jerusalem, independent of the server's TZ. */
function jerusalemHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(h);
}

export function isPhoneAfterHours(now: Date = new Date()): boolean {
  const h = jerusalemHour(now);
  return h >= AFTER_HOURS_START || h < AFTER_HOURS_END;
}
