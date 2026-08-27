// Keyword-matching logic for the phone bot's spoken menu (Twilio + Yemot) —
// the actual phrase *text* now lives in voice-phrases.server.ts (admin-
// editable via /admin/voice-bot-text); this file only has the matching
// logic, which isn't something an admin edits through a text box.
//
// This used to be a key-press (1-6) menu, but Yemot's DTMF ("tap") read
// mode turned out not to work reliably live ("לא הקשת כמות מספרים נכונה")
// and a numbered menu is also just more friction than it needs to be — so
// now it's plain speech, matched by keyword ("השכרת סטודיו", "דרכי הגעה"
// etc). Crucially: if nothing matches, we don't reject the input and
// re-prompt — we just treat whatever was said as the opening line of the
// normal open conversation, since it was very likely a real question to
// begin with.

export type MenuChoice = 1 | 2 | 3 | 4 | 6;

// Order matters: checked top to bottom, first match wins. "אביזר" is
// checked before "סטודיו" since "השכרת אביזרים לסטודיו" should still land
// on props, not studio.
const INTENT_KEYWORDS: Array<[RegExp, MenuChoice]> = [
  [/אביזר/, 2],
  [/הגעה|כתובת|וויז|ווייז|איפה אתם|איך מגיעים|תחנה|אוטובוס/, 3],
  [/הדרכה|תקלה|לא עובד|לא מבזיק|לא נדלק|משדר|רקע.*מותר/, 4],
  [/(תשאיר|תעביר|תרשמ|להשאיר|להעביר).*הודעה|הודעה ל(סטודיו|צוות)/, 6],
  [/סטודיו/, 1],
];

/** Best-effort keyword match against a caller's spoken sentence — null if nothing recognizable matched. */
export function detectMenuIntent(speech: string | null | undefined): MenuChoice | null {
  const s = (speech ?? "").trim();
  if (!s) return null;
  for (const [re, choice] of INTENT_KEYWORDS) {
    if (re.test(s)) return choice;
  }
  return null;
}

const GUIDE_EVERYTHING_WORDS = ["הכל", "הכול", "הכולל", "הדרכה מלאה", "ספרי הכל", "ספר הכל", "תספר", "תספרי"];

export function wantsFullGuide(speech: string | null | undefined): boolean {
  const s = (speech ?? "").trim();
  if (!s) return false;
  return GUIDE_EVERYTHING_WORDS.some((w) => s.includes(w));
}
