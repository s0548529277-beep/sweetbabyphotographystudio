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
  [/הגעה|כתובת|וויז|ווייז|איפה אתם|איך מגיעים|תחנה|אוטובוס/, 3],
  [/הדרכה|תקלה|לא עובד|לא מבזיק|לא נדלק|משדר|רקע.*מותר/, 4],
  [/(תשאיר|תעביר|תרשמ|להשאיר|להעביר).*הודעה|הודעה ל(סטודיו|צוות)/, 6],
];

// "אביזר" and "סטודיו" on their own are too common — they show up inside
// completely ordinary QUESTIONS too ("האם הסטודיו פנוי ביום שלישי"), and a
// bare-word match was swallowing those into the canned blurb instead of
// letting the AI actually check availability — confirmed live on a real
// call. So these two only count as a menu *pick* (not a real question) when
// the sentence is short and doesn't contain a question word.
const QUESTION_INDICATORS = /(האם|מתי|כמה|אפשר|יש|פנוי|פנויה|מי|למה|איך|איפה)/;

function looksLikeMenuPick(s: string): boolean {
  const wordCount = s.trim().split(/\s+/).filter(Boolean).length;
  return wordCount <= 4 && !QUESTION_INDICATORS.test(s);
}

/** Best-effort keyword match against a caller's spoken sentence — null if nothing recognizable matched. */
export function detectMenuIntent(speech: string | null | undefined): MenuChoice | null {
  const s = (speech ?? "").trim();
  if (!s) return null;
  for (const [re, choice] of INTENT_KEYWORDS) {
    if (re.test(s)) return choice;
  }
  if (!looksLikeMenuPick(s)) return null;
  if (/אביזר/.test(s)) return 2;
  if (/סטודיו/.test(s)) return 1;
  return null;
}

// Explicit "I want to actually book/reserve now" phrasing — a short sentence
// like "רוצה לשריין סטודיו" (4 words) still passes looksLikeMenuPick above
// and lands on the bare "סטודיו"/"אביזר" menu-pick match, which used to mean
// she'd hear the pricing blurb first and only get to real booking a full
// round-trip later. Longer, more natural sentences ("אני רוצה לשריין תור
// בסטודיו בבקשה") already skip the menu entirely via looksLikeMenuPick's
// word-count cutoff and go straight to the open conversation — this closes
// the same gap for the short phrasing.
const BOOKING_INTENT_WORDS = /לשריין|לקבוע (תור|זמן)|להזמין תור|לתפוס תור|רוצה תור|לשמור תור|רוצה לשריין|רוצה לקבוע|רוצה להזמין/;

/** True when the caller's short sentence already signals she wants to book/reserve now, not just hear info. */
export function wantsToBookNow(speech: string | null | undefined): boolean {
  const s = (speech ?? "").trim();
  if (!s) return false;
  return BOOKING_INTENT_WORDS.test(s);
}

const GUIDE_EVERYTHING_WORDS = ["הכל", "הכול", "הכולל", "הדרכה מלאה", "ספרי הכל", "ספר הכל", "תספר", "תספרי"];

export function wantsFullGuide(speech: string | null | undefined): boolean {
  const s = (speech ?? "").trim();
  if (!s) return false;
  return GUIDE_EVERYTHING_WORDS.some((w) => s.includes(w));
}
