// A complete studio-booking flow that never calls the AI — a fixed sequence
// of questions (name → date → time → duration → email → confirm), parsed
// deterministically, reusing the exact same createPhoneBooking used by the
// AI's own create_phone_booking tool. Built per explicit request, directly
// motivated by a real outage where all 3 AI providers (Gemini, Groq,
// Lovable) failed on every single turn of several live calls — a caller
// who wanted to book had no way to actually do it. This flow has NO such
// dependency: it only ever touches Supabase/Google Calendar (via
// createPhoneBooking), never generateTextResilient.
//
// Two input modes, chosen by the admin (NOAI_BOOKING_ENABLED_KEY in
// voice-phrases.server.ts) and carried in draft.inputMode for the rest of
// the call:
//
// - "speech" (default): every answer is free speech-to-text, parsed by
//   keyword/regex. Rather than attempt full free-form NLU with hand-written
//   regexes (an unverifiable guess at accuracy, the same trap the niqqud
//   fixup fell into — see ai-bot-efficiency skill), each question is narrow
//   and self-checking: if a turn can't be parsed with confidence, it
//   re-asks instead of silently guessing wrong and creating a booking for
//   the wrong day/time. The one place this can't stay narrow — an hour
//   spoken with no morning/evening word ("תשע" alone) — is genuinely
//   ambiguous for this business specifically (a real morning newborn-
//   package slot exists at 8/9/10, and evening sessions commonly run
//   8/9/10pm too), so that case gets an explicit follow-up question
//   ("בבוקר או בערב?") instead of a coin-flip default.
//
// - "dtmf": date/time/duration/confirm are captured as KEYPAD digits
//   instead (yemotSayAndListenTap in yemot.server.ts) — name/email stay
//   speech regardless (typing free text on a phone keypad is real friction,
//   not worth forcing). A PREVIOUS keypad attempt on this exact phone line
//   failed live with "לא הקשת כמות מספרים נכונה" (wrong digit count) and
//   was removed entirely rather than left half-working — this version uses
//   Yemot's own built-in "Date"/"Time" typing_playback_mode presets (which
//   also fix the exact required digit count) instead of a hand-picked one,
//   specifically to avoid repeating that same mismatch; see
//   yemot.server.ts's own doc comment for the source this was confirmed
//   against. Bonus: 24-hour keypad entry for time has no AM/PM ambiguity at
//   all, so "dtmf" mode never needs the nb_ampm follow-up question.
import { israelNow } from "@/lib/availability.server";
import { lookupCallerProfile } from "@/lib/voice-caller.server";
import { createPhoneBooking } from "@/lib/voice-booking.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";
import type { YemotTapOptions } from "@/lib/yemot.server";

export type NbInputMode = "speech" | "dtmf";

export type NbStage = "nb_name" | "nb_date" | "nb_ampm" | "nb_time" | "nb_duration" | "nb_email" | "nb_confirm";

export const NB_STAGES: readonly NbStage[] = ["nb_name", "nb_date", "nb_ampm", "nb_time", "nb_duration", "nb_email", "nb_confirm"];

export function isNbStage(stage: string | null | undefined): stage is NbStage {
  return !!stage && (NB_STAGES as readonly string[]).includes(stage);
}

// The stages where "dtmf" mode listens for keypad digits instead of speech
// — name/email/ampm are never in here (ampm doesn't even occur in dtmf
// mode; see the file doc comment). api.yemot.ivr.ts uses this to decide
// whether to read params.digits or params.speech off the incoming request.
export const NB_TAP_STAGES: ReadonlySet<NbStage> = new Set(["nb_date", "nb_time", "nb_duration", "nb_confirm"]);

export type DraftBooking = {
  inputMode?: NbInputMode; // set once at start, carried through every step
  name?: string;
  email?: string | null;
  date?: string; // YYYY-MM-DD
  hour?: number; // 0-23, resolved (post AM/PM if needed)
  pendingHour?: number; // 1-11, waiting on the nb_ampm follow-up (speech mode only)
  minute?: number; // 0 or 30
  slots?: number; // 2..12 half-hour units (1-6 hours)
};

// ---------- date parsing (speech) ----------

function tokens(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const WEEKDAY_TOKENS: Record<string, number> = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };
const WEEKDAY_NAMES_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const HE_MONTHS: Record<string, number> = {
  ינואר: 1, פברואר: 2, מרץ: 3, מרס: 3, אפריל: 4, מאי: 5, יוני: 6,
  יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
};

function parseExplicitDate(s: string, todayIso: string): string | null {
  const byMonthName = s.match(/(\d{1,2})\s*ב?([א-ת]+)/);
  const byDigits = s.match(/(\d{1,2})[./-](\d{1,2})/);
  let day: number | undefined;
  let month: number | undefined;
  if (byMonthName && HE_MONTHS[byMonthName[2]]) {
    day = Number(byMonthName[1]);
    month = HE_MONTHS[byMonthName[2]];
  } else if (byDigits) {
    day = Number(byDigits[1]);
    month = Number(byDigits[2]);
  }
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;
  const year = Number(todayIso.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  let candidate = `${year}-${pad(month)}-${pad(day)}`;
  if (candidate < todayIso) candidate = `${year + 1}-${pad(month)}-${pad(day)}`; // she means next year's date, not one already past
  return candidate;
}

/** Deterministic best-effort date parse — null if nothing recognizable matched (caller should re-ask, never guess). */
export function parseSpokenDate(speechRaw: string, todayIso: string = israelNow().date): string | null {
  const s = (speechRaw || "").trim();
  if (!s) return null;
  if (/מחרתיים/.test(s)) return addDaysIso(todayIso, 2);
  if (/מחר/.test(s)) return addDaysIso(todayIso, 1);
  if (/היום/.test(s)) return todayIso;
  for (const t of tokens(s)) {
    if (t in WEEKDAY_TOKENS) {
      const todayWeekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
      const offset = (WEEKDAY_TOKENS[t] - todayWeekday + 7) % 7; // 0 = today, matches "היום" already being covered above
      return addDaysIso(todayIso, offset);
    }
  }
  return parseExplicitDate(s, todayIso);
}

export function formatSpokenDateHe(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `יום ${WEEKDAY_NAMES_HE[weekday]}, ${d}/${m}`;
}

// ---------- date/time/duration parsing (dtmf) ----------

// Yemot echoes typed digits back with separators added (confirmed live —
// a real "Date"-mode entry came back as "02-02-2026", not raw "02022026"),
// not just plain digits as originally assumed. Stripping everything but
// digits first makes every parser below robust to whichever formatting
// Yemot actually applies, instead of guessing at the exact separator.
function digitsOnly(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

/**
 * Day + month only (4 digits, DDMM) — year is auto-filled to the current
 * one, rolling to next year if that date has already passed this year
 * (same rule parseExplicitDate uses for the speech-mode equivalent). Per
 * explicit request: typing a 4-digit year on a phone keypad is friction
 * nobody needs when "this year, or next year if it's already past" covers
 * every realistic booking. This intentionally does NOT use Yemot's
 * built-in "Date" typing_playback_mode preset (DDMMYYYY, 8 digits, and the
 * source of the dash-formatted echo above) — a plain 4-digit read is both
 * shorter to type and sidesteps that formatting question entirely.
 */
export function parseDigitsDate(raw: string, todayIso: string = israelNow().date): string | null {
  const d = digitsOnly(raw);
  if (d.length !== 4) return null;
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const year = Number(todayIso.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  let candidate = `${year}-${pad(month)}-${pad(day)}`;
  if (candidate < todayIso) candidate = `${year + 1}-${pad(month)}-${pad(day)}`;
  return candidate;
}

/** 4 digits, HHMM, 24h. Minutes restricted to :00/:30 — the studio only ever books on the half hour. */
export function parseDigitsTime(raw: string): { hour: number; minute: number } | null {
  const d = digitsOnly(raw);
  if (d.length !== 4) return null;
  const hour = Number(d.slice(0, 2));
  const minute = Number(d.slice(2, 4));
  if (hour < 0 || hour > 23) return null;
  if (minute !== 0 && minute !== 30) return null;
  return { hour, minute };
}

/** A single digit, 1-6 — digits_allowed on the Yemot side already rejects anything else, this just parses what came back. */
export function parseDigitsDuration(raw: string): number | null {
  const d = digitsOnly(raw);
  if (!/^[1-6]$/.test(d)) return null;
  return Number(d);
}

// ---------- time parsing (speech) ----------

const HOUR_WORDS: Record<string, number> = {
  אחת: 1, שתיים: 2, שניים: 2, שתים: 2, שלוש: 3, ארבע: 4, חמש: 5, שש: 6, שבע: 7, שמונה: 8, תשע: 9, עשר: 10,
};

function extractHourNumber(s: string): number | null {
  if (/(אחת|אחד)\s*עשרה?/.test(s)) return 11;
  if (/(שתים|שתיים|שניים)\s*עשרה?/.test(s)) return 12;
  const digitMatch = s.match(/\b(\d{1,2})\b/);
  if (digitMatch) {
    const n = Number(digitMatch[1]);
    if (n >= 0 && n <= 23) return n;
  }
  for (const [word, n] of Object.entries(HOUR_WORDS)) {
    if (s.includes(word)) return n;
  }
  return null;
}

export type ParsedHour = { hour: number; minute: number; ambiguous: boolean };

/** Null only when no number was recognized at all — an ambiguous-but-parsed hour (e.g. "תשע" alone) still returns a result, flagged ambiguous, so the caller can ask the one follow-up question instead of re-asking the whole thing. */
export function parseSpokenHour(speechRaw: string): ParsedHour | null {
  const s = (speechRaw || "").trim();
  if (!s) return null;
  const hour = extractHourNumber(s);
  if (hour === null) return null;
  const minute = /וחצי/.test(s) ? 30 : 0;
  const isPm = /ערב|צהריים|לילה/.test(s);
  const isAm = /בוקר/.test(s);

  if (hour >= 13) return { hour, minute, ambiguous: false }; // already 24h form, e.g. spoken/transcribed "20"
  if (hour === 12) return { hour: isAm ? 0 : 12, minute, ambiguous: false };
  if (isPm) return { hour: hour + 12, minute, ambiguous: false };
  if (isAm) return { hour, minute, ambiguous: false };
  return { hour, minute, ambiguous: true }; // 1-11 with no morning/evening word — genuinely ambiguous, see file doc comment
}

/** Resolves a pending 1-11 hour once she's answered "בבוקר"/"בערב" to the follow-up question — null if her answer was neither. */
export function resolveAmPm(speechRaw: string, pendingHour: number): number | null {
  const s = (speechRaw || "").trim();
  const isPm = /ערב|צהריים|לילה/.test(s);
  const isAm = /בוקר/.test(s);
  if (isPm) return pendingHour === 12 ? 12 : pendingHour + 12;
  if (isAm) return pendingHour === 12 ? 0 : pendingHour;
  return null;
}

// ---------- duration parsing (speech) ----------

const DURATION_WORDS: Record<string, number> = { שלוש: 3, ארבע: 4, חמש: 5, שש: 6 };

/** Hours (1-6) — this flow caps duration there to keep speech parsing tractable; a longer session should go through the AI or a human. */
export function parseSpokenDurationHours(speechRaw: string): number | null {
  const s = (speechRaw || "").trim();
  if (!s) return null;
  const digitMatch = s.match(/\b(\d{1,2})\b/);
  if (digitMatch) {
    const n = Number(digitMatch[1]);
    if (n >= 1 && n <= 6) return n;
  }
  if (/שעתיים/.test(s)) return 2;
  if (/שעה/.test(s)) return 1;
  for (const [word, n] of Object.entries(DURATION_WORDS)) {
    if (s.includes(word)) return n;
  }
  return null;
}

// ---------- email (always speech, regardless of mode) ----------

/** Only accepts a clean, literally-transcribed address — no attempt to reconstruct a spelled-out "at"/"dot" email, which speech-to-text renders too unreliably to guess at safely. */
export function extractEmailish(speechRaw: string): string | null {
  const s = (speechRaw || "").replace(/\s+/g, "");
  const m = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : null;
}

const DECLINE_EMAIL_WORDS = /לא צריך|בלי מייל|אין לי מייל|לא רוצה|בלי אימייל|דלג/;

// ---------- question builders — one place each stage's phrasing (and, for dtmf mode, its tap config) is decided, shared by both the "start" and "advance" paths so they can never drift apart ----------

export type Question = { stage: NbStage; say: string; tap?: YemotTapOptions };

function buildConfirmSummary(draft: DraftBooking): string {
  const dateText = draft.date ? formatSpokenDateHe(draft.date) : "";
  const hourText = draft.hour !== undefined ? `בשעה ${String(draft.hour).padStart(2, "0")}:${String(draft.minute ?? 0).padStart(2, "0")}` : "";
  const hoursCount = draft.slots ? draft.slots / 2 : undefined;
  const durationText = hoursCount ? (hoursCount === 1 ? "לשעה אחת" : `ל־${hoursCount} שעות`) : "";
  const emailText = draft.email ? "ואשלח אישור גם למייל" : "בלי אישור במייל";
  return `לסיכום: שריון סטודיו ל${draft.name ?? "עבורך"}, ${dateText}, ${hourText}, ${durationText}, ${emailText}.`;
}

const DATE_TAP: YemotTapOptions = { minDigits: 4, maxDigits: 4 };

function questionForDate(draft: DraftBooking): Question {
  if (draft.inputMode === "dtmf") {
    return {
      stage: "nb_date",
      say: "באיזה תאריך תרצי לשריין? אפשר להקיש יום וחודש, ארבע ספרות — לדוגמה חמישה עשר בנובמבר זה אחת חמש אחת אחת.",
      tap: DATE_TAP,
    };
  }
  return { stage: "nb_date", say: "לאיזה יום תרצי לשריין? אפשר להגיד למשל 'היום', 'מחר', או שם של יום כמו 'יום שלישי'." };
}

function questionForTime(draft: DraftBooking, prefix = ""): Question {
  const dateNote = draft.date ? `נרשם ${formatSpokenDateHe(draft.date)}. ` : "";
  if (draft.inputMode === "dtmf") {
    return {
      stage: "nb_time",
      say: `${prefix}${dateNote}באיזו שעה תרצי להגיע? אפשר להקיש שעה בפורמט של 24 שעות, ארבע ספרות, לדוגמה תשע בערב זה שתיים אפס אפס אפס. הדקות חייבות להיות 00 או 30.`,
      tap: { mode: "Time" },
    };
  }
  return { stage: "nb_time", say: `${prefix}${dateNote}באיזו שעה תרצי להגיע? אפשר להגיד למשל 'תשע בבוקר' או 'שמונה בערב'.` };
}

const DURATION_TAP: YemotTapOptions = { mode: "Digits", digitsAllowed: [1, 2, 3, 4, 5, 6], minDigits: 1, maxDigits: 1 };

function questionForDuration(draft: DraftBooking): Question {
  if (draft.inputMode === "dtmf") {
    return { stage: "nb_duration", say: "לכמה שעות תרצי לשריין? אפשר להקיש ספרה אחת בין 1 ל-6.", tap: DURATION_TAP };
  }
  return { stage: "nb_duration", say: "לכמה שעות תרצי לשריין? אפשר בין שעה לשש שעות." };
}

function questionForEmail(): Question {
  return { stage: "nb_email", say: "רוצה שאשלח גם אישור במייל? אם כן אפשר להגיד את כתובת המייל בקול, ואם לא צריך תגידי 'לא צריך'." };
}

const CONFIRM_TAP: YemotTapOptions = { mode: "Digits", digitsAllowed: [1, 2], minDigits: 1, maxDigits: 1 };

function questionForConfirm(draft: DraftBooking): Question {
  const summary = buildConfirmSummary(draft);
  if (draft.inputMode === "dtmf") {
    return { stage: "nb_confirm", say: `${summary} אפשר להקיש 1 לאישור או 2 לביטול.`, tap: CONFIRM_TAP };
  }
  return { stage: "nb_confirm", say: `${summary} רק תגידי 'כן' לאישור או 'לא' לביטול.` };
}

/**
 * Regenerates the CURRENT stage's question (same phrasing/tap config it was
 * originally asked with) without advancing any state — used when Yemot
 * reports silence/no-input on a call that's mid-flow, so the re-prompt
 * doesn't accidentally fall back to a speech-mode read on a call that's
 * actually in "dtmf" mode (which would silently and confusingly bump the
 * caller out of keypad mode the moment she goes quiet for a beat).
 */
export function currentNbQuestion(stage: NbStage, draft: DraftBooking): Question {
  switch (stage) {
    case "nb_name":
      return { stage, say: "מה השם המלא שלך?" };
    case "nb_date":
      return questionForDate(draft);
    case "nb_time":
      return questionForTime(draft);
    case "nb_ampm":
      return { stage, say: "בבוקר או בערב?" };
    case "nb_duration":
      return questionForDuration(draft);
    case "nb_email":
      return questionForEmail();
    case "nb_confirm":
      return questionForConfirm(draft);
  }
}

// ---------- the flow itself ----------

/** First turn — greets into the flow, pre-filling name/email for a recognized caller (same lookup the AI path already uses) so a known customer skips straight to the date question. `mode` comes from the admin's NOAI_BOOKING_ENABLED_KEY setting and is stored on the draft for every later step. */
export async function startNoAiBooking(phone: string, mode: NbInputMode): Promise<{ stage: NbStage; draft: DraftBooking; say: string; tap?: YemotTapOptions }> {
  const known = await lookupCallerProfile(phone).catch(() => null);
  const draft: DraftBooking = { inputMode: mode };
  if (known?.name) draft.name = known.name;
  if (known?.email) draft.email = known.email;
  const intro = "בסדר, נשריין ביחד שלב אחר שלב. ";
  if (draft.name) {
    const q = questionForDate(draft);
    return { ...q, draft, say: intro + q.say };
  }
  return { stage: "nb_name", draft, say: `${intro}מה השם המלא שלך?` };
}

export type NbResult =
  | ({ done: false; draft: DraftBooking } & Question)
  | { done: true; say: string; hangup: boolean };

/** One turn of the flow — pure w.r.t. everything except the final createPhoneBooking call on confirmation. The caller (api.yemot.ivr.ts) is responsible for persisting the returned stage/draft, and for reading the right raw field (params.digits vs params.speech, per NB_TAP_STAGES + draft.inputMode) into `answerRaw`. */
export async function continueNoAiBooking(stage: NbStage, answerRaw: string, draft: DraftBooking, phone: string): Promise<NbResult> {
  const mode: NbInputMode = draft.inputMode ?? "speech";
  const answer = (answerRaw || "").trim();

  switch (stage) {
    case "nb_name": {
      // Always speech, regardless of mode — typing a name on a phone keypad isn't worth forcing.
      const name = answer.slice(0, 120);
      if (name.length < 2) return { done: false, stage: "nb_name", draft, say: "לא הצלחתי לתפוס את השם, אפשר לחזור על זה?" };
      const nextDraft = { ...draft, name };
      return { done: false, draft: nextDraft, ...questionForDate(nextDraft) };
    }

    case "nb_date": {
      const date = mode === "dtmf" ? parseDigitsDate(answer) : parseSpokenDate(answer);
      if (!date) {
        const retry = mode === "dtmf" ? "לא זיהיתי תאריך תקין. אפשר להקיש שוב, יום וחודש, ארבע ספרות?" : "לא הצלחתי להבין את התאריך. אפשר להגיד 'היום', 'מחר', 'מחרתיים', או שם של יום בשבוע?";
        return { done: false, stage: "nb_date", draft, say: retry, tap: mode === "dtmf" ? DATE_TAP : undefined };
      }
      const nextDraft = { ...draft, date };
      return { done: false, draft: nextDraft, ...questionForTime(nextDraft) };
    }

    case "nb_time": {
      if (mode === "dtmf") {
        const parsed = parseDigitsTime(answer);
        if (!parsed) {
          return { done: false, stage: "nb_time", draft, say: "לא זיהיתי שעה תקינה. אפשר להקיש שוב, ארבע ספרות בפורמט 24 שעות — והדקות חייבות להיות 00 או 30?", tap: { mode: "Time" } };
        }
        const nextDraft = { ...draft, hour: parsed.hour, minute: parsed.minute };
        return { done: false, draft: nextDraft, ...questionForDuration(nextDraft) };
      }
      const parsed = parseSpokenHour(answer);
      if (!parsed) return { done: false, stage: "nb_time", draft, say: "לא הצלחתי להבין את השעה. אפשר להגיד מספר, למשל 'תשע בבוקר' או 'שמונה בערב'?" };
      if (parsed.ambiguous) {
        return { done: false, stage: "nb_ampm", draft: { ...draft, pendingHour: parsed.hour, minute: parsed.minute }, say: "בבוקר או בערב?" };
      }
      const nextDraft = { ...draft, hour: parsed.hour, minute: parsed.minute };
      return { done: false, draft: nextDraft, ...questionForDuration(nextDraft) };
    }

    case "nb_ampm": {
      // Speech-only stage — dtmf mode never reaches here (the "Time" preset's 24h format has no AM/PM ambiguity to begin with).
      const resolved = draft.pendingHour !== undefined ? resolveAmPm(answer, draft.pendingHour) : null;
      if (resolved === null) return { done: false, stage: "nb_ampm", draft, say: "אפשר להגיד רק 'בוקר' או 'ערב'?" };
      const nextDraft = { ...draft, hour: resolved, pendingHour: undefined };
      return { done: false, draft: nextDraft, ...questionForDuration(nextDraft) };
    }

    case "nb_duration": {
      const hours = mode === "dtmf" ? parseDigitsDuration(answer) : parseSpokenDurationHours(answer);
      if (!hours) {
        const retry = mode === "dtmf" ? "ספרה לא תקינה. אפשר להקיש שוב, מ-1 עד 6?" : "לא הצלחתי להבין. כמה שעות — אחת, שעתיים, שלוש?";
        return { done: false, stage: "nb_duration", draft, say: retry, tap: mode === "dtmf" ? DURATION_TAP : undefined };
      }
      const nextDraft: DraftBooking = { ...draft, slots: hours * 2 };
      if (nextDraft.email !== undefined) return { done: false, draft: nextDraft, ...questionForConfirm(nextDraft) };
      return { done: false, draft: nextDraft, ...questionForEmail() };
    }

    case "nb_email": {
      // Always speech, regardless of mode — same reasoning as nb_name.
      if (DECLINE_EMAIL_WORDS.test(answer)) {
        const nextDraft: DraftBooking = { ...draft, email: null };
        return { done: false, draft: nextDraft, ...questionForConfirm(nextDraft) };
      }
      const email = extractEmailish(answer);
      if (!email) {
        return { done: false, stage: "nb_email", draft, say: "לא הצלחתי לתפוס כתובת מייל ברורה. אפשר לנסות שוב, או להגיד 'לא צריך' כדי לדלג?" };
      }
      const nextDraft: DraftBooking = { ...draft, email };
      return { done: false, draft: nextDraft, ...questionForConfirm(nextDraft) };
    }

    case "nb_confirm": {
      const negative = mode === "dtmf" ? answer === "2" : /^(לא|בטל|תבטלי)\b/.test(answer) || /לא רוצה|לבטל/.test(answer);
      if (negative) return { done: true, say: "בסדר, ביטלתי. אפשר להתקשר שוב בכל שלב. תודה ולהתראות!", hangup: true };

      const affirmative = mode === "dtmf" ? answer === "1" : /כן|נכון|מאשרת|מאשר|בסדר|אישור|תשריני|קדימה/.test(answer);
      if (!affirmative) return { done: false, draft, ...questionForConfirm(draft) };

      try {
        const startTime = `${String(draft.hour ?? 0).padStart(2, "0")}:${String(draft.minute ?? 0).padStart(2, "0")}`;
        const result = await createPhoneBooking({
          session_date: draft.date!,
          start_time: startTime,
          slots: draft.slots!,
          contact_name: draft.name || "לקוחה טלפונית",
          contact_phone: phone,
          contact_email: draft.email || undefined,
          notes: `התקבל דרך תהליך ההזמנה הקבוע (ללא בינה, ${mode === "dtmf" ? "בהקלדה" : "בדיבור"}) בטלפון`,
        });
        const priceText = (result as any).alreadyExisted ? "כבר שמרתי לך את זה קודם בשיחה הזו" : `המחיר ${result.price}₪, מקדמה ${result.deposit}₪`;
        const emailText = draft.email ? " שלחתי גם אישור למייל." : "";
        return {
          done: true,
          hangup: true,
          say: `השריון נשמר! ${priceText}.${emailText} אם לא תקבלי אישור סופי תוך 12 שעות, כדאי להתקשר לוודא ישירות מול הצוות. תודה שהתקשרת!`,
        };
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg.includes("תפוס")) {
          const nextDraft = { ...draft, hour: undefined, minute: undefined };
          const q = questionForTime(nextDraft, `${msg}. `);
          return { done: false, draft: nextDraft, ...q };
        }
        console.error("[SWEETBABY] no-AI phone booking creation failed", e);
        // Never let a real booking attempt just vanish into a server log —
        // same "always leave a trace" principle as leave_message_for_studio.
        await sendMessageToStudio({
          message: `ניסיון שריון בתהליך הקבוע (ללא בינה) נכשל: ${JSON.stringify(draft)}. שגיאה: ${msg || String(e)}`,
          callerPhone: phone,
          contactName: draft.name ?? null,
          context: "כשל בתהליך ההזמנה הקבוע (ללא בינה) בטלפון",
        });
        return { done: true, hangup: true, say: "משהו השתבש בשמירת השריון. העברתי את כל הפרטים לצוות והם יחזרו אלייך בהקדם. סליחה על אי הנוחות." };
      }
    }
  }
}
