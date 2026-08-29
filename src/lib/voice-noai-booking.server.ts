// A complete studio-booking flow that never calls the AI — a fixed sequence
// of questions (name → date → time → duration → email → confirm), parsed
// deterministically by keyword/regex, reusing the exact same
// createPhoneBooking used by the AI's own create_phone_booking tool. Built
// per explicit request, directly motivated by a real outage where all 3 AI
// providers (Gemini, Groq, Lovable) failed on every single turn of several
// live calls — a caller who wanted to book had no way to actually do it.
// This flow has NO such dependency: it only ever touches Supabase/Google
// Calendar (via createPhoneBooking), never generateTextResilient.
//
// Deliberately narrower than the AI's own understanding — Yemot's DTMF/tap
// read mode doesn't work reliably live (see yemot.server.ts's own doc
// comment), so this still has to work from free speech-to-text, not keypad
// digits. Rather than attempt full free-form NLU with hand-written regexes
// (an unverifiable guess at accuracy, the same trap the niqqud fixup fell
// into — see ai-bot-efficiency skill), each question is narrow and
// self-checking: if a turn can't be parsed with confidence, it re-asks
// instead of silently guessing wrong and creating a booking for the wrong
// day/time. The one place this can't stay narrow — an hour spoken with no
// morning/evening word ("תשע" alone) — is genuinely ambiguous for this
// business specifically (a real morning newborn-package slot exists at
// 8/9/10, and evening sessions commonly run 8/9/10pm too), so that case
// gets an explicit follow-up question ("בבוקר או בערב?") instead of a
// coin-flip default.
import { israelNow } from "@/lib/availability.server";
import { lookupCallerProfile } from "@/lib/voice-caller.server";
import { createPhoneBooking } from "@/lib/voice-booking.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";

export type NbStage = "nb_name" | "nb_date" | "nb_ampm" | "nb_time" | "nb_duration" | "nb_email" | "nb_confirm";

export const NB_STAGES: readonly NbStage[] = ["nb_name", "nb_date", "nb_ampm", "nb_time", "nb_duration", "nb_email", "nb_confirm"];

export function isNbStage(stage: string | null | undefined): stage is NbStage {
  return !!stage && (NB_STAGES as readonly string[]).includes(stage);
}

export type DraftBooking = {
  name?: string;
  email?: string | null;
  date?: string; // YYYY-MM-DD
  hour?: number; // 0-23, resolved (post AM/PM if needed)
  pendingHour?: number; // 1-11, waiting on the nb_ampm follow-up
  minute?: number; // 0 or 30
  slots?: number; // 2..12 half-hour units (1-6 hours)
};

// ---------- date parsing ----------

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

// ---------- time parsing ----------

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

// ---------- duration parsing ----------

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

// ---------- email ----------

/** Only accepts a clean, literally-transcribed address — no attempt to reconstruct a spelled-out "at"/"dot" email, which speech-to-text renders too unreliably to guess at safely. */
export function extractEmailish(speechRaw: string): string | null {
  const s = (speechRaw || "").replace(/\s+/g, "");
  const m = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : null;
}

const DECLINE_EMAIL_WORDS = /לא צריך|בלי מייל|אין לי מייל|לא רוצה|בלי אימייל|דלג/;

// ---------- the flow itself ----------

function buildConfirmText(draft: DraftBooking): string {
  const dateText = draft.date ? formatSpokenDateHe(draft.date) : "";
  const hourText = draft.hour !== undefined ? `בשעה ${String(draft.hour).padStart(2, "0")}:${String(draft.minute ?? 0).padStart(2, "0")}` : "";
  const hoursCount = draft.slots ? draft.slots / 2 : undefined;
  const durationText = hoursCount ? (hoursCount === 1 ? "לשעה אחת" : `ל־${hoursCount} שעות`) : "";
  const emailText = draft.email ? `ואשלח אישור גם למייל` : "בלי אישור במייל";
  return `לסיכום: שריון סטודיו ל${draft.name ?? "עבורך"}, ${dateText}, ${hourText}, ${durationText}, ${emailText}. לאשר?`;
}

/** First turn — greets into the flow, pre-filling name/email for a recognized caller (same lookup the AI path already uses) so a known customer skips straight to the date question. */
export async function startNoAiBooking(phone: string): Promise<{ stage: NbStage; draft: DraftBooking; say: string }> {
  const known = await lookupCallerProfile(phone).catch(() => null);
  const draft: DraftBooking = {};
  if (known?.name) draft.name = known.name;
  if (known?.email) draft.email = known.email;
  const intro = "בסדר, נשריין ביחד שלב אחר שלב.";
  if (draft.name) {
    return { stage: "nb_date", draft, say: `${intro} לאיזה יום תרצי לשריין? אפשר להגיד למשל 'היום', 'מחר', או שם של יום כמו 'יום שלישי'.` };
  }
  return { stage: "nb_name", draft, say: `${intro} מה השם המלא שלך?` };
}

export type NbResult =
  | { done: false; stage: NbStage; draft: DraftBooking; say: string }
  | { done: true; say: string; hangup: boolean };

/** One turn of the flow — pure w.r.t. everything except the final createPhoneBooking call on confirmation. The caller (api.yemot.ivr.ts) is responsible for persisting the returned stage/draft. */
export async function continueNoAiBooking(stage: NbStage, speechRaw: string, draft: DraftBooking, phone: string): Promise<NbResult> {
  const speech = (speechRaw || "").trim();

  switch (stage) {
    case "nb_name": {
      const name = speech.slice(0, 120);
      if (name.length < 2) return { done: false, stage: "nb_name", draft, say: "לא הצלחתי לתפוס את השם, אפשר לחזור על זה?" };
      return {
        done: false,
        stage: "nb_date",
        draft: { ...draft, name },
        say: "מעולה. לאיזה יום תרצי לשריין? אפשר להגיד למשל 'היום', 'מחר', או שם של יום כמו 'יום שלישי'.",
      };
    }

    case "nb_date": {
      const date = parseSpokenDate(speech);
      if (!date) return { done: false, stage: "nb_date", draft, say: "לא הצלחתי להבין את התאריך. אפשר להגיד 'היום', 'מחר', 'מחרתיים', או שם של יום בשבוע?" };
      return {
        done: false,
        stage: "nb_time",
        draft: { ...draft, date },
        say: `נרשם ${formatSpokenDateHe(date)}. באיזו שעה תרצי להגיע? אפשר להגיד למשל 'תשע בבוקר' או 'שמונה בערב'.`,
      };
    }

    case "nb_time": {
      const parsed = parseSpokenHour(speech);
      if (!parsed) return { done: false, stage: "nb_time", draft, say: "לא הצלחתי להבין את השעה. אפשר להגיד מספר, למשל 'תשע בבוקר' או 'שמונה בערב'?" };
      if (parsed.ambiguous) {
        return { done: false, stage: "nb_ampm", draft: { ...draft, pendingHour: parsed.hour, minute: parsed.minute }, say: "בבוקר או בערב?" };
      }
      return {
        done: false,
        stage: "nb_duration",
        draft: { ...draft, hour: parsed.hour, minute: parsed.minute },
        say: "לכמה שעות תרצי לשריין? אפשר בין שעה לשש שעות.",
      };
    }

    case "nb_ampm": {
      const resolved = draft.pendingHour !== undefined ? resolveAmPm(speech, draft.pendingHour) : null;
      if (resolved === null) return { done: false, stage: "nb_ampm", draft, say: "אפשר להגיד רק 'בוקר' או 'ערב'?" };
      return {
        done: false,
        stage: "nb_duration",
        draft: { ...draft, hour: resolved, pendingHour: undefined },
        say: "לכמה שעות תרצי לשריין? אפשר בין שעה לשש שעות.",
      };
    }

    case "nb_duration": {
      const hours = parseSpokenDurationHours(speech);
      if (!hours) return { done: false, stage: "nb_duration", draft, say: "לא הצלחתי להבין. כמה שעות — אחת, שעתיים, שלוש?" };
      const nextDraft: DraftBooking = { ...draft, slots: hours * 2 };
      if (nextDraft.email !== undefined) return { done: false, stage: "nb_confirm", draft: nextDraft, say: buildConfirmText(nextDraft) };
      return { done: false, stage: "nb_email", draft: nextDraft, say: "רוצה שאשלח גם אישור במייל? אם כן תגידי את כתובת המייל, ואם לא צריך תגידי 'לא צריך'." };
    }

    case "nb_email": {
      if (DECLINE_EMAIL_WORDS.test(speech)) {
        const nextDraft: DraftBooking = { ...draft, email: null };
        return { done: false, stage: "nb_confirm", draft: nextDraft, say: buildConfirmText(nextDraft) };
      }
      const email = extractEmailish(speech);
      if (!email) {
        return { done: false, stage: "nb_email", draft, say: "לא הצלחתי לתפוס כתובת מייל ברורה. אפשר לנסות שוב, או להגיד 'לא צריך' כדי לדלג?" };
      }
      const nextDraft: DraftBooking = { ...draft, email };
      return { done: false, stage: "nb_confirm", draft: nextDraft, say: buildConfirmText(nextDraft) };
    }

    case "nb_confirm": {
      const negative = /^(לא|בטל|תבטלי)\b/.test(speech) || /לא רוצה|לבטל/.test(speech);
      if (negative) return { done: true, say: "בסדר, ביטלתי. אפשר להתקשר שוב בכל שלב. תודה ולהתראות!", hangup: true };

      const affirmative = /כן|נכון|מאשרת|מאשר|בסדר|אישור|תשריני|קדימה/.test(speech);
      if (!affirmative) return { done: false, stage: "nb_confirm", draft, say: `${buildConfirmText(draft)} רק תגידי 'כן' לאישור או 'לא' לביטול.` };

      try {
        const startTime = `${String(draft.hour ?? 0).padStart(2, "0")}:${String(draft.minute ?? 0).padStart(2, "0")}`;
        const result = await createPhoneBooking({
          session_date: draft.date!,
          start_time: startTime,
          slots: draft.slots!,
          contact_name: draft.name || "לקוחה טלפונית",
          contact_phone: phone,
          contact_email: draft.email || undefined,
          notes: "התקבל דרך תהליך ההזמנה הקבוע (ללא בינה) בטלפון",
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
          return { done: false, stage: "nb_time", draft: { ...draft, hour: undefined, minute: undefined }, say: `${msg}. באיזו שעה אחרת תרצי להגיע?` };
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
