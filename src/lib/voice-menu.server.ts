// The fixed key-press menu both phone lines (Twilio + Yemot) present right
// after the greeting, before handing off to the open AI conversation —
// requested so a caller who just wants directions or the equipment guide
// doesn't have to talk to the AI at all. Shared here so the two protocol
// handlers (api.voice.respond.ts / api.yemot.ivr.ts) don't each reimplement
// the same parsing/copy and drift apart.
import { STUDIO_GUIDE_HE } from "./ai.functions";
import { ARRIVAL_TEXT_HE } from "./arrival";

export type MenuChoice = 1 | 2 | 3 | 4 | 5;

export const MENU_PROMPT =
  "להשכרת סטודיו הקישו או אמרו אחת. להשכרת אביזרים — שתיים. לדרכי הגעה — שלוש. להדרכה לשימוש בסטודיו — ארבע. לשיחה חופשית איתי על כל דבר אחר — חמש.";

export const MENU_DIDNT_CATCH = "לא זיהיתי בחירה. אפשר להקיש על המספר, או פשוט להגיד אותו — למשל תגידו אחת.";

// Twilio's <Gather input="dtmf speech"> hands back Digits directly; a
// spoken "אחת"/"1"/"one" etc lands in the speech transcript instead — same
// for Yemot's "tap" vs "voice" reads. One parser covers both: try the raw
// digit field first (cheap, exact), then look for a number word/digit
// anywhere in whatever speech text came back.
const SPOKEN_NUMBERS: Record<string, MenuChoice> = {
  "1": 1, "אחת": 1, "אחד": 1, "one": 1,
  "2": 2, "שתיים": 2, "שניים": 2, "two": 2,
  "3": 3, "שלוש": 3, "three": 3,
  "4": 4, "ארבע": 4, "four": 4,
  "5": 5, "חמש": 5, "five": 5,
};

export function parseMenuChoice(digit: string | null | undefined, speech: string | null | undefined): MenuChoice | null {
  const d = (digit ?? "").trim();
  if (d && d in SPOKEN_NUMBERS) return SPOKEN_NUMBERS[d];
  const s = (speech ?? "").trim().toLowerCase();
  if (!s) return null;
  // Whole-word match only — "שלוש" inside a longer sentence like "אני צריכה
  // חדר לשלוש שעות" would otherwise misfire as menu choice 3.
  for (const word of s.split(/[\s,.!?]+/)) {
    if (word in SPOKEN_NUMBERS) return SPOKEN_NUMBERS[word];
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
