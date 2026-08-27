// The fixed spoken-keyword menu both phone lines (Twilio + Yemot) present
// right after the greeting, before handing off to the open AI conversation
// — requested so a caller who just wants directions or the equipment guide
// doesn't have to talk to the AI at all. Shared here so the two protocol
// handlers (api.voice.respond.ts / api.yemot.ivr.ts) don't each reimplement
// the same parsing/copy and drift apart.
//
// This used to be a key-press (1-6) menu, but Yemot's DTMF ("tap") read
// mode turned out not to work reliably live ("לא הקשת כמות מספרים נכונה")
// and a numbered menu is also just more friction than it needs to be — so
// now it's plain speech, matched by keyword ("השכרת סטודיו", "דרכי הגעה"
// etc). Crucially: if nothing matches, we don't reject the input and
// re-prompt — we just treat whatever was said as the opening line of the
// normal open conversation, since it was very likely a real question to
// begin with.
import { STUDIO_GUIDE_HE } from "./ai.functions";
import { ARRIVAL_TEXT_HE } from "./arrival";

export type MenuChoice = 1 | 2 | 3 | 4 | 6;

// Framed explicitly as a fallback (not the primary channel) and leads with
// the fastest self-serve option — per direct feedback: the bot only picks
// up when there's no live answer, so say that, and point first to Google
// before the AI conversation. Shared by both phone lines so the wording
// never drifts between them.
export const GREETING =
  "שלום, הגעתם לסטודיו סוויט בייבי. אין כרגע מענה אנושי, הכי מהיר בדרך כלל לחפש בגוגל סטודיו סוויט בייבי ולמצוא הכל באתר. אם זה לא נוח עכשיו, אני כאן לעזור.";

export const MENU_PROMPT =
  "אפשר לומר במה לעזור: השכרת סטודיו, השכרת אביזרים, דרכי הגעה, הדרכה לשימוש בסטודיו, או להשאיר הודעה. או פשוט לשאול אותי כל שאלה אחרת.";

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

export const STUDIO_BLURB =
  "השכרת סטודיו: שעה ראשונה 120 שקל, כל שעה נוספת 90 שקל. שריון דורש מקדמה של 90 שקל. אפשר גם חבילת ניו-בורן בוקר, 3 שעות ב-240 שקל.";

export const PROPS_BLURB =
  "השכרת אביזרים: יש קטלוג של יותר מ-400 אביזרים באתר, מינימום הזמנה 50 שקל, לפי 24 שעות השכרה.";

export const GUIDE_CHOICE_PROMPT = "רוצים שאספר את כל ההדרכה לשימוש בסטודיו, או שיש שאלה ספציפית או תקלה?";

const GUIDE_EVERYTHING_WORDS = ["הכל", "הכול", "הכולל", "הדרכה מלאה", "ספרי הכל", "ספר הכל", "תספר", "תספרי"];

export function wantsFullGuide(speech: string | null | undefined): boolean {
  const s = (speech ?? "").trim();
  if (!s) return false;
  return GUIDE_EVERYTHING_WORDS.some((w) => s.includes(w));
}

/** The full equipment guide, reformatted as short spoken sentences instead of a numbered written list. */
export const FULL_GUIDE_SPOKEN =
  "אז ככה, ההדרכה המלאה לשימוש בסטודיו: " +
  STUDIO_GUIDE_HE
    .split(/\n/)
    .map((line) => line.replace(/^\d+\)\s*/, "").replace(/^[א-ת]\)\s*/gm, ""))
    .join(" ואז, ");

export const ARRIVAL_SPOKEN = ARRIVAL_TEXT_HE.replace(/\n/g, " ");

// ---- "Leave a message" — reachable by keyword from the menu, and also
// used as the fallback whenever the bot would otherwise just promise "the
// studio will call you back" — see voice-message.server.ts. ----
export const LEAVE_MESSAGE_PROMPT = "בטח, אפשר להגיד את ההודעה עכשיו, ואני אשלח אותה מיד לצוות הסטודיו כולל המספר שממנו התקשרתם.";
export const LEAVE_MESSAGE_THANKS = "תודה, ההודעה נשלחה לסטודיו ויחזרו אליכם בהקדם. יש עוד משהו שאפשר לעזור בו?";
