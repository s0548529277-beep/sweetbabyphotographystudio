/**
 * Phone-bot night hours (owner request 2026-10-25, revised same night):
 * from 22:00 until 08:00 Israel time the bot keeps working NORMALLY (menu,
 * AI, bookings, messages) — it only adds a short spoken notice to the start
 * of a NEW call, after the regular greeting and before the menu: no one
 * answers now, and props pickup/return is not possible after 22:00 — from
 * 8:00 in the morning. (An earlier version that same night hung up instead;
 * the owner asked for the bot to stay on.) Applies to both phone channels:
 * Yemot (`api.yemot.ivr.ts`, first-hit branch only) and Twilio
 * (`api.voice.incoming.ts`). The website chatbot is not affected.
 */
export const AFTER_HOURS_START = 22; // inclusive, 22:00
export const AFTER_HOURS_END = 8; // exclusive, 08:00

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

/**
 * The notice to speak at the start of a call during night hours, or "" in
 * the daytime. Says "מחר" only before midnight — after midnight 8:00 is
 * the same day.
 */
export function afterHoursNotice(now: Date = new Date()): string {
  if (!isPhoneAfterHours(now)) return "";
  // Times are written as words, not "22:00"/"8:00" — TTS reads digit
  // times awkwardly. No niqqud on purpose (see voice-chat.server.ts: guessed
  // niqqud made pronunciation worse; unverifiable from here).
  const when = jerusalemHour(now) >= AFTER_HOURS_START ? "מחר משמונה בבוקר" : "משמונה בבוקר";
  return `כרגע אין מענה. איסוף והחזרת אביזרים אינם מתאפשרים אחרי עשר בלילה, אפשר לתאם ${when}. בינתיים אפשר להמשיך כאן כרגיל.`;
}
