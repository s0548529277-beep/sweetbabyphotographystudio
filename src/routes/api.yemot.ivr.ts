import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseYemotParams, yemotAck, yemotSayAndHangup, yemotSayAndListen, yemotSayAndListenTap, yemotSayThenResume, type YemotTapOptions } from "@/lib/yemot.server";
import { runVoiceTurn, type VoiceMessage, type VoiceTurnResult } from "@/lib/voice-chat.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";
import { detectMenuIntent, wantsFullGuide, wantsToBookNow } from "@/lib/voice-menu.server";
import { getVoiceBotConfig } from "@/lib/voice-phrases.server";
import { personalizedGreeting } from "@/lib/voice-caller.server";
import { consumePendingVoiceNotification } from "@/lib/voice-pending-notification.server";
import { startNoAiBooking, continueNoAiBooking, currentNbQuestion, isNbStage, NB_TAP_STAGES, type DraftBooking, type NbInputMode } from "@/lib/voice-noai-booking.server";

// Keypad-only main menu ("dtmf" menu mode, MENU_MODE_KEY in
// voice-phrases.server.ts) — added per a direct report that speech
// recognition kept failing live even after the quiet_max fix in
// yemot.server.ts.
//
// 2026-09-09, confirmed live the same day: NOT using mode:"Digits" here —
// a direct report showed every keypress on this menu got Yemot's own
// NATIVE post-entry confirmation on top of it ("שלוש... לאישור הקישו
// אחד", matching Yemot's own system message M1353, "לאישור הקישו 1,
// להקלטה מחודשת 2" — confirmed via Yemot's own forum this same day) —
// redundant and confusing stacked on top of this app's own menu handling,
// which already treats a single digit as final with no confirmation step
// of its own. Per YemotTapOptions' own doc comment on `mode`, this was
// always the documented behavior of the "Digits" preset ("reads the typed
// digits back for confirmation") — it was copied from voice-noai-
// booking.server.ts's CONFIRM_TAP/DURATION_TAP without registering that
// those two have the exact same latent issue (see that file's own note,
// fixed the same day). Omitting `mode` entirely still gets digit
// validation for free — Yemot itself rejects anything outside
// digitsAllowed before it ever reaches us — just without the native
// readback+confirm layered on top.
const MENU_DTMF_TAP: YemotTapOptions = { digitsAllowed: [1, 2, 3, 4, 5], minDigits: 1, maxDigits: 1 };
const LEAVE_MSG_DTMF_CONFIRM_TAP: YemotTapOptions = { digitsAllowed: [1, 2], minDigits: 1, maxDigits: 1 };
const DTMF_MENU_STAGES = new Set(["menu_dtmf", "leaving_message_dtmf_confirm"]);

// Played instead of phrases.leave_message_thanks when sendMessageToStudio's
// email genuinely didn't go out — per explicit request, the "thanks" phrase
// itself now says explicitly that the email was sent, so it must never be
// spoken on a real failure. Not admin-editable (same reasoning as the AI
// tool's own analogous fallback text in voice-chat.server.ts) — this is a
// rare edge case (Gmail down), not something that needs day-to-day wording
// control.
const LEAVE_MESSAGE_EMAIL_FAILED_TEXT =
  "קִבַּלְתִּי אֶת הַהוֹדָעָה שֶׁלָּךְ וְהִיא נִשְׁמְרָה אֶצְלֵנוּ, גַּם אִם לֹא הִצְלַחְתִּי לְאַשֵּׁר שֶׁהַמַּיְיל יָצָא — יַחְזְרוּ אֵלַיִךְ בְּהֶקְדֵּם.";

// One extension in ימות המשיח, configured as a "שלוחת API" pointing here —
// unlike Twilio's two-URL pattern (incoming call vs. gather response),
// Yemot re-hits this exact same URL for every turn of the call, so this
// handler covers the whole conversation: the first hit has no `speech`
// field yet (greet + start listening), every later hit carries the
// caller's transcribed reply in it. Sessions are keyed in the same
// voice_call_sessions table the Twilio line uses, under a "yemot:"-
// prefixed call id so the two providers' call ids can never collide.
export const Route = createFileRoute("/api/yemot/ivr")({
  server: {
    handlers: {
      GET: (ctx) => handle(ctx.request),
      POST: (ctx) => handle(ctx.request),
    },
  },
});

// Session lookup with a defensive fallback. draft_booking is a recently
// added column (voice-noai-booking.server.ts) — if the migration that adds
// it hasn't actually reached this deployment's database yet, selecting it
// makes the WHOLE query fail, and since supabase-js returns {data: null,
// error} instead of throwing, a caller that doesn't check `error` (as
// every select in this file used to) sees that as EXACTLY "no session row
// exists". Confirmed live: a real call's diagnostic log showed every turn
// after the greeting landing in the "no session" branch — phrases.
// didnt_hear, over and over, no escalation — despite real, clear speech
// each time ("הזמנת סטודיו" etc.), which only makes sense if the session
// row the greeting turn wrote was never actually missing, just unreadable
// through this specific select. Falling back to a select WITHOUT
// draft_booking here means a schema-deploy lag like this can never again
// silently strand an entire call — worst case, an in-progress no-AI-
// booking draft is lost (draft ends up {}), never a stuck phone line.
async function selectVoiceSession(
  supabaseAdmin: any,
  callSid: string,
): Promise<{ messages: unknown; from_number: string | null; stage: string | null; draft_booking: unknown } | null> {
  const full = await supabaseAdmin.from("voice_call_sessions").select("messages, from_number, stage, draft_booking").eq("call_sid", callSid).maybeSingle();
  if (!full.error) return full.data ?? null;
  console.error(`[SWEETBABY] voice_call_sessions select with draft_booking failed, falling back without it — callSid=${callSid}`, full.error);
  const fallback = await supabaseAdmin.from("voice_call_sessions").select("messages, from_number, stage").eq("call_sid", callSid).maybeSingle();
  if (fallback.error) {
    console.error(`[SWEETBABY] voice_call_sessions select fallback ALSO failed — callSid=${callSid}`, fallback.error);
    return null;
  }
  return fallback.data ? { ...fallback.data, draft_booking: null } : null;
}

// Write-side counterpart to selectVoiceSession, same reasoning: an upsert
// whose payload includes draft_booking fails as a WHOLE if that column
// isn't actually live on the database yet, and every write in this file
// used to just `await` the upsert without checking its error — so a
// schema-deploy lag didn't just make draft_booking unreadable, it could
// silently stop stage/messages from ever being saved at all (the row
// stays on its previous stage forever, and the caller only sees this as
// the conversation seeming to reset or ignore what she just said). Confirmed
// live: real logs showed the exact "column ... does not exist" error on
// every single select while this shipped. Retrying without draft_booking
// here means the core save (stage/messages, which are NOT new columns)
// always goes through regardless — worst case, an in-progress no-AI-
// booking draft doesn't persist to the next turn.
async function upsertVoiceSession(
  supabaseAdmin: any,
  row: { call_sid: string; from_number: string | null; messages: unknown; stage: string; draft_booking?: DraftBooking | null },
): Promise<void> {
  const payload = { ...row, draft_booking: row.draft_booking ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabaseAdmin.from("voice_call_sessions").upsert(payload, { onConflict: "call_sid" });
  if (!error) return;
  console.error(`[SWEETBABY] voice_call_sessions upsert with draft_booking failed, retrying without it — callSid=${row.call_sid}`, error);
  const { draft_booking: _drop, ...withoutDraft } = payload;
  const { error: error2 } = await supabaseAdmin.from("voice_call_sessions").upsert(withoutDraft, { onConflict: "call_sid" });
  if (error2) console.error(`[SWEETBABY] voice_call_sessions upsert fallback ALSO failed — callSid=${row.call_sid}`, error2);
}

async function handle(request: Request): Promise<Response> {
  const params = await parseYemotParams(request);
  const rawCallId = params.ApiCallId;
  if (!rawCallId) return new Response("Bad Request", { status: 400 });
  const callSid = `yemot:${rawCallId}`;
  const callerPhone = params.ApiPhone || "";

  if (params.hangup === "yes") return yemotAck();

  const rawSpeech = (params.speech ?? "").trim();
  // A 0-1 character "answer" is almost always speech-recognition noise (a
  // stray breath, a click, a half-caught syllable) rather than something
  // real to respond to — treated the same as silence instead of being fed
  // to the AI, which would otherwise try to answer it literally and come
  // across as confused/wrong. This is part of what read as "the bot doesn't
  // understand" on live calls.
  const speech = rawSpeech.length >= 2 ? rawSpeech : "";
  // Set only by yemotSayAndListenTap's valName ("digits") — a caller
  // answering a DTMF question (no-AI booking flow, "dtmf" mode) never
  // populates `speech` at all, so the "no answer" gate right below has to
  // check for this too, or a real keypad answer would be misread as
  // silence and get re-prompted with the wrong (speech) message.
  const rawDigits = (params.digits ?? "").trim();
  const hasAnswer = !!speech || !!rawDigits;
  const { phrases, menuMode, noAiBookingMode, thinkingFillerEnabled, thinkingFillerMusicId } = await getVoiceBotConfig();
  const noAiBookingEnabled = noAiBookingMode !== "off";
  const nbInputMode: NbInputMode = noAiBookingMode === "dtmf" ? "dtmf" : "speech";

  // TEMPORARY diagnostic — a real call reported "לא הבנתי, אפשר לחזור על
  // זה" repeating on every turn despite real, clear speech each time
  // ("הזמנת סטודיו" etc.). Cloudflare's logs only show HTTP status, never
  // the actual TTS text returned, so there's no way to tell FROM THE LOGS
  // ALONE which of the several code paths that can return phrases.
  // didnt_hear actually fired. This single line, matched against
  // callSid/ApiCallId across the whole call, will make that unambiguous on
  // the next real call — remove once the cause is confirmed.
  console.error(`[SWEETBABY][diag] yemot hit callSid=${callSid} hasAnswer=${hasAnswer} speech="${speech}" digits="${rawDigits}"`);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Runs the actual (possibly slow) AI turn against an already-built
    // message list and replies with whatever directive the model's action
    // calls for — shared by the normal path (runOpenTurn below, when
    // thinkingFillerEnabled is off) and the "ai_pending" resume branch
    // right below (when it's on, this runs on the follow-up hit AFTER the
    // filler already played). Same "always await, never bare-return" rule
    // as runOpenTurn used to note inline — a rejection here must hit this
    // function's own caller's try/catch, never escape raw.
    const runDeferredAiTurn = async (fullMessages: VoiceMessage[], phone: string): Promise<Response> => {
      const { text, action }: VoiceTurnResult = await runVoiceTurn(fullMessages, phone);
      const updatedMessages: VoiceMessage[] = [...fullMessages, { role: "assistant", content: text }];
      if (action === "transfer") {
        await upsertVoiceSession(supabaseAdmin, {
          call_sid: callSid,
          from_number: phone,
          messages: [...updatedMessages, { role: "assistant", content: phrases.no_human_transfer }],
          stage: "leaving_message",
        });
        return yemotSayAndListen(`${text} ${phrases.no_human_transfer}`);
      }
      await upsertVoiceSession(supabaseAdmin, { call_sid: callSid, from_number: phone, messages: updatedMessages, stage: "chat" });
      if (action === "hangup") return yemotSayAndHangup(text);
      return yemotSayAndListen(text);
    };

    if (!hasAnswer) {
      const existing = await selectVoiceSession(supabaseAdmin, callSid);

      // Resume half of the thinking-filler mechanic (THINKING_FILLER_KEY in
      // voice-phrases.server.ts) — this specific re-hit is Yemot
      // auto-continuing right after speaking phrases.thinking_filler, not a
      // real caller reply, so hasAnswer is (expectedly) false here. The
      // caller's real turn is already the last message in
      // existing.messages (saved by runOpenTurn below before the filler was
      // spoken) — do the real work now instead of treating this as silence
      // and re-prompting her with "didn't hear that".
      if (existing && (existing as { stage?: string }).stage === "ai_pending") {
        // TEMPORARY diagnostic, same reasoning as the one above — a direct
        // report said the filler ("רגע אחד...") sometimes doesn't actually
        // lead to the real check running (falls through to leave-a-message
        // instead). yemotSayThenResume's quiet_max=1 was reverted as the
        // most likely cause (see its own doc comment), but this line makes
        // it possible to CONFIRM the resume actually reached here — vs.
        // never reaching this branch at all — on the next real call.
        console.error(`[SWEETBABY][diag] ai_pending resume reached, running deferred AI turn — callSid=${callSid}`);
        const priorMessages = ((existing.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
        const phone = existing.from_number || callerPhone;
        return await runDeferredAiTurn(priorMessages, phone);
      }

      if (!existing) {
        // Genuinely the first hit of the call — no session yet. If there's a
        // message waiting for this number (a booking confirmation/reminder
        // that was only "flash"-rung, not actually spoken, to avoid Yemot
        // units — see campaign.server.ts), play it now, once, before the
        // normal greeting+menu — this is the real delivery of that message.
        const pending = await consumePendingVoiceNotification(callerPhone);
        // If the caller's number matches a real site account, personalize
        // with her name — best-effort, falls back to the plain greeting.
        const menuText = menuMode === "dtmf" ? phrases.menu_prompt_dtmf : phrases.menu_prompt;
        const greetingWithMenu = await personalizedGreeting(`${phrases.greeting} ${menuText}`, callerPhone);
        const fullGreeting = pending ? `${pending} ${greetingWithMenu}` : greetingWithMenu;
        const stage = menuMode === "dtmf" ? "menu_dtmf" : "menu";
        await supabaseAdmin.from("voice_call_sessions").upsert(
          { call_sid: callSid, from_number: callerPhone, messages: [{ role: "assistant", content: fullGreeting }], stage, updated_at: new Date().toISOString() },
          { onConflict: "call_sid" },
        );
        return menuMode === "dtmf" ? yemotSayAndListenTap(fullGreeting, MENU_DTMF_TAP) : yemotSayAndListen(fullGreeting);
      }

      // Mid-call with no speech heard (silence, or Yemot's speech-to-text
      // just failed to catch anything) — re-prompt without resetting the
      // conversation. This branch used to reply with phrases.didnt_hear
      // WITHOUT saving it to the session's messages — so there was no way to
      // tell "this is the first time" from "the caller has now heard this
      // exact prompt several times in a row and is stuck" (confirmed live:
      // reported as the bot repeating "לא הבנתי, אפשר לחזור על זה?" many
      // times). Now it's saved, so a second consecutive silence escalates to
      // offering to leave a message instead of repeating the same prompt —
      // the same pattern already used below for repeated AI errors.
      const priorMessages = ((existing.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
      const phone = existing.from_number || callerPhone;
      const existingStage = (existing as { stage?: string }).stage ?? "menu";

      // A "dtmf"-mode no-AI booking question was read with
      // yemotSayAndListenTap, not yemotSayAndListen — falling through to the
      // generic speech-mode didnt_hear/leave_message flow below would
      // silently bump the caller out of keypad mode the moment she goes
      // quiet for a beat (the re-prompt would listen for SPEECH, and any
      // digits she then pressed would never reach params.digits at all).
      // Re-issue the exact same tap question instead — safe to repeat
      // indefinitely, same as a PIN pad retrying until she types something.
      if (isNbStage(existingStage)) {
        const draft = ((existing as any).draft_booking as DraftBooking | null) ?? {};
        const q = currentNbQuestion(existingStage, draft);
        await upsertVoiceSession(supabaseAdmin, { call_sid: callSid, from_number: phone, messages: priorMessages, stage: existingStage, draft_booking: draft });
        return q.tap ? yemotSayAndListenTap(q.say, q.tap) : yemotSayAndListen(q.say);
      }

      // Same reasoning as isNbStage right above — the keypad-only main menu
      // ("dtmf" menu mode) and its leave-a-message confirm step are read
      // with yemotSayAndListenTap too; re-issue the same tap prompt on
      // silence instead of falling through to the generic speech-mode
      // didnt_hear below, which would silently bump her out of keypad mode.
      if (DTMF_MENU_STAGES.has(existingStage)) {
        const lastAssistant = [...priorMessages].reverse().find((m) => m.role === "assistant")?.content ?? phrases.menu_prompt_dtmf;
        const tap = existingStage === "menu_dtmf" ? MENU_DTMF_TAP : LEAVE_MSG_DTMF_CONFIRM_TAP;
        await upsertVoiceSession(supabaseAdmin, { call_sid: callSid, from_number: phone, messages: priorMessages, stage: existingStage });
        return yemotSayAndListenTap(lastAssistant, tap);
      }

      const lastWasDidntHear = priorMessages[priorMessages.length - 1]?.content === phrases.didnt_hear;
      if (lastWasDidntHear) {
        await supabaseAdmin.from("voice_call_sessions").upsert(
          { call_sid: callSid, from_number: phone, messages: [...priorMessages, { role: "assistant", content: phrases.leave_message_prompt }], stage: "leaving_message", updated_at: new Date().toISOString() },
          { onConflict: "call_sid" },
        );
        return yemotSayAndListen(phrases.leave_message_prompt);
      }
      await supabaseAdmin.from("voice_call_sessions").upsert(
        {
          call_sid: callSid,
          from_number: phone,
          messages: [...priorMessages, { role: "assistant", content: phrases.didnt_hear }],
          stage: (existing as { stage?: string }).stage ?? "menu",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "call_sid" },
      );
      console.error(`[SWEETBABY][diag] didnt_hear via SILENCE branch, callSid=${callSid}`);
      return yemotSayAndListen(phrases.didnt_hear);
    }

    const session = await selectVoiceSession(supabaseAdmin, callSid);

    // No session row (e.g. Yemot re-asked without ever hitting us fresh) —
    // treat like "didn't catch that" rather than starting a whole new
    // greeting mid-conversation.
    if (!session) {
      console.error(`[SWEETBABY][diag] didnt_hear via NO-SESSION branch (real speech/digits present but no DB row for this callSid), callSid=${callSid}`);
      return yemotSayAndListen(phrases.didnt_hear);
    }

    const priorMessages = ((session.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
    const phone = session.from_number || callerPhone;
    const stage = (session as { stage?: string }).stage ?? "menu";

    const save = (messages: VoiceMessage[], newStage: string, draft?: DraftBooking | null) =>
      upsertVoiceSession(supabaseAdmin, { call_sid: callSid, from_number: phone, messages, stage: newStage, draft_booking: draft ?? null });

    // The OTHER half of the thinking-filler resume (see the `!hasAnswer`
    // branch's own "ai_pending" check above for the normal case). This one
    // covers the less common case: she said something DURING the filler's
    // brief listen window (yemotSayThenResume) instead of staying quiet —
    // e.g. adding a detail, or just repeating herself while waiting. Her
    // original request is already the last message in priorMessages (saved
    // right before the filler played); append what she just said as a
    // follow-up rather than dropping it, then run the real (slow) AI turn
    // exactly like the silent case does — never leave "ai_pending" stranded
    // with an unanswered user turn sitting in the session.
    if (stage === "ai_pending") {
      const withFollowUp: VoiceMessage[] = [...priorMessages, { role: "user", content: speech || rawDigits }];
      return await runDeferredAiTurn(withFollowUp, phone);
    }

    // Responds with one turn of the no-AI booking flow (voice-noai-
    // booking.server.ts) — shared by both ways into it: the explicit
    // "book now" phrasing in fixed-menu mode, and the automatic escalation
    // when the AI keeps failing but she's clearly trying to book (see the
    // catch block below).
    const respondNbStart = async (userText: string, forceMode?: NbInputMode, sayPrefix?: string): Promise<Response> => {
      // forceMode: the keypad-only main menu ("dtmf" menu mode, option 1)
      // always wants the booking sub-flow itself in "dtmf" input mode too,
      // regardless of the separate NOAI_BOOKING_ENABLED_KEY admin setting
      // (that one controls a DIFFERENT entry point — a spoken "רוצה לשריין"
      // in fixed/AI menu mode, or the AI-keeps-failing escalation below) —
      // those two toggles are independent, so option 1 must not silently
      // fall back to speech-mode booking just because the OTHER setting
      // happens to be "speech".
      // sayPrefix: spoken once before the flow's own first question — used
      // by menu option 1 (per direct request) to state studio pricing
      // (phrases.studio_blurb, already admin-editable) before asking
      // anything, so a caller who came straight to booking without hearing
      // the price elsewhere still hears it.
      const start = await startNoAiBooking(phone, forceMode ?? nbInputMode);
      const say = sayPrefix ? `${sayPrefix} ${start.say}` : start.say;
      await save([...priorMessages, { role: "user", content: userText }, { role: "assistant", content: say }], start.stage, start.draft);
      return start.tap ? yemotSayAndListenTap(say, start.tap) : yemotSayAndListen(say);
    };
    const respondNb = async (result: Awaited<ReturnType<typeof continueNoAiBooking>>, userText: string): Promise<Response> => {
      if (result.done) {
        await save([...priorMessages, { role: "user", content: userText }, { role: "assistant", content: result.say }], "chat", null);
        return result.hangup ? yemotSayAndHangup(result.say) : yemotSayAndListen(result.say);
      }
      await save([...priorMessages, { role: "user", content: userText }, { role: "assistant", content: result.say }], result.stage, result.draft);
      return result.tap ? yemotSayAndListenTap(result.say, result.tap) : yemotSayAndListen(result.say);
    };

    // Runs a real AI turn and replies with the right directive for whatever
    // the model decided to do — shared by every stage that can fall through
    // into the open conversation. IMPORTANT: every call site below must
    // `return await runOpenTurn(...)`, never a bare `return runOpenTurn(...)`
    // — confirmed live in production logs: when it isn't awaited, a rejection
    // (e.g. every AI fallback tier failing at once) skips this function's own
    // try/catch entirely and escapes as a raw uncaught error, which the
    // runtime turned into a bare HTTP 402 straight to Yemot instead of our
    // graceful phrases.temporary_error fallback — silently breaking the call.
    const runOpenTurn = async (userText: string): Promise<Response> => {
      const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: userText }];
      if (thinkingFillerEnabled) {
        // Say something right away instead of leaving her in dead air while
        // the AI (and its tool calls) run — sometimes many seconds, see
        // runVoiceTurn's own 30s-budget comment. jump to "ai_pending" and
        // let the resume handling (the `!hasAnswer` branch above for the
        // normal "stayed quiet" case, or the "ai_pending" check right after
        // `session` loads below if she said something in that window) do
        // the real work and reply for real.
        await save(messages, "ai_pending");
        return yemotSayThenResume(phrases.thinking_filler, thinkingFillerMusicId);
      }
      // A live transfer (routing_yemot) needs a real extension configured
      // on Yemot's side pointing at a phone number — confirmed live that
      // it isn't set up ("השלוחה אליה ביקשתם לעבור אינה פעילה עקב חוסר
      // בהגדרות"), so runDeferredAiTurn always offers a message instead of
      // attempting a transfer that's known to fail. Twilio's Dial verb
      // (api.voice.respond.ts) doesn't have this dependency.
      return await runDeferredAiTurn(messages, phone);
    };

    // ---- Stage 0: the no-AI, fixed-question booking flow ----
    // (voice-noai-booking.server.ts) — never touches the AI at all, so it
    // works exactly when the 3-tier AI fallback doesn't. Reached either
    // explicitly (see the "fixed" menu-mode branch below) or automatically
    // when the AI keeps failing on a call that's clearly trying to book
    // (see the catch block at the end of this function).
    if (isNbStage(stage)) {
      const draft = ((session as any).draft_booking as DraftBooking | null) ?? {};
      // "dtmf" mode's tap stages (date/time/duration/confirm) come back as
      // `digits`, never `speech` — see hasAnswer's own comment above for why
      // the earlier silence gate already had to account for this too.
      const usesTap = draft.inputMode === "dtmf" && NB_TAP_STAGES.has(stage);
      const answer = usesTap ? rawDigits : speech;
      const result = await continueNoAiBooking(stage, answer, draft, phone);
      return await respondNb(result, answer);
    }

    // ---- Stage 0b: the keypad-only main menu ("dtmf" menu mode) ----
    // See MENU_MODE_KEY's own doc comment in voice-phrases.server.ts and
    // DTMF_MENU_STEPS in admin.voice-bot-text.tsx (kept in sync manually)
    // for the full 1-5 breakdown. Re-presents the same tap menu after any
    // info option instead of ever falling into speech/AI territory — the
    // whole point of this mode is staying keypad-only end to end.
    // Speaks `infoText` followed immediately by the keypad menu again (one
    // combined utterance, one tap-listen) and saves that exact combined
    // text as the single assistant turn — so the silence-retry branch's
    // "re-speak the last assistant message" always includes the info she
    // may not have heard yet, not just the trailing menu prompt.
    const respondMenuDtmfWithInfo = async (userDigit: string, infoText: string): Promise<Response> => {
      const text = `${infoText} ${phrases.menu_prompt_dtmf}`;
      await save([...priorMessages, { role: "user", content: userDigit }, { role: "assistant", content: text }], "menu_dtmf");
      return yemotSayAndListenTap(text, MENU_DTMF_TAP);
    };

    if (stage === "menu_dtmf") {
      if (rawDigits === "1") return await respondNbStart(rawDigits, "dtmf", phrases.studio_blurb);
      if (rawDigits === "2") return await respondMenuDtmfWithInfo(rawDigits, phrases.props_blurb);
      if (rawDigits === "3") return await respondMenuDtmfWithInfo(rawDigits, phrases.arrival_spoken);
      if (rawDigits === "4") return await respondMenuDtmfWithInfo(rawDigits, phrases.full_guide_spoken);
      // "5" (the only other digit Yemot's own digitsAllowed lets through) —
      // leave a message. The message text itself still needs real speech
      // (an open-ended message has no keypad equivalent); only the
      // confirm/send step is keypad-driven, see "leaving_message_dtmf" below.
      await save([...priorMessages, { role: "user", content: rawDigits }, { role: "assistant", content: phrases.leave_message_prompt }], "leaving_message_dtmf");
      return yemotSayAndListen(phrases.leave_message_prompt);
    }

    // ---- Stage 0c: recording the message text for option 5 above ----
    if (stage === "leaving_message_dtmf") {
      await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.dtmf_leave_message_confirm }], "leaving_message_dtmf_confirm");
      return yemotSayAndListenTap(phrases.dtmf_leave_message_confirm, LEAVE_MSG_DTMF_CONFIRM_TAP);
    }

    // ---- Stage 0d: keypad confirm/send for the message just recorded ----
    if (stage === "leaving_message_dtmf_confirm") {
      if (rawDigits === "2") {
        const text = `${phrases.dtmf_leave_message_redo} ${phrases.leave_message_prompt}`;
        await save([...priorMessages, { role: "user", content: rawDigits }, { role: "assistant", content: text }], "leaving_message_dtmf");
        return yemotSayAndListen(text);
      }
      // rawDigits === "1" (the only other option digitsAllowed permits) —
      // the message text is the last user-role turn saved by the
      // leaving_message_dtmf stage right above.
      const messageText = [...priorMessages].reverse().find((m) => m.role === "user")?.content ?? "";
      const result = await sendMessageToStudio({ message: messageText, callerPhone: phone, context: "התקבל דרך הבוט הטלפוני (ימות המשיח, תפריט הקשות)" });
      // leave_message_thanks itself already says the email went out — see
      // its own doc comment further down — so this only ever plays it when
      // that's actually true, exactly like the speech-mode leaving_message
      // stage below.
      const combined = `${result.emailed ? phrases.leave_message_thanks : LEAVE_MESSAGE_EMAIL_FAILED_TEXT} ${phrases.menu_prompt_dtmf}`;
      await save([...priorMessages, { role: "user", content: rawDigits }, { role: "assistant", content: combined }], "menu_dtmf");
      return yemotSayAndListenTap(combined, MENU_DTMF_TAP);
    }

    // ---- Stage 1: the spoken-keyword menu ----
    if (stage === "menu") {
      // Checked BEFORE the "ai" mode early-return below, and before
      // detectMenuIntent — independent of menu mode entirely. Per direct
      // report: a caller saying an explicit, unambiguous "book now" phrase
      // ("רוצה לשריין", "הזמנת סטודיו" etc. — see BOOKING_INTENT_WORDS'
      // narrow word list) needs to reliably end in a REAL reservation, the
      // same guarantee "fixed" mode always gave via this exact deterministic
      // flow — not left to depend on whether the AI's own tool-calling
      // happens to follow through this specific turn. This only fires on
      // that narrow, explicit phrasing; anything less direct (a date
      // mention, a general pricing question) still goes to the AI in "ai"
      // mode exactly as before, so its natural flexibility for everything
      // else is untouched.
      if (noAiBookingEnabled && wantsToBookNow(speech)) return await respondNbStart(speech);

      // "ai" mode (see MENU_MODE_KEY's doc comment): skip the canned-phrase
      // keyword routing entirely — every OTHER stage-1 utterance goes
      // straight into the real AI conversation, which already knows all the
      // same facts (pricing, hours, policies in SYSTEM; arrival/equipment
      // guide via on-demand tools) and can book naturally via
      // create_phone_booking. "fixed" mode (the admin-toggleable revert)
      // keeps the exact original behavior below unchanged.
      if (menuMode === "ai") return await runOpenTurn(speech);

      const intent = detectMenuIntent(speech);
      if (intent === 3) {
        const text = `${phrases.arrival_spoken} ${phrases.anything_else}`;
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
        return yemotSayAndListen(text);
      }
      if (intent === 4) {
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.guide_choice_prompt }], "guide_choice");
        return yemotSayAndListen(phrases.guide_choice_prompt);
      }
      if (intent === 6) {
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.leave_message_prompt }], "leaving_message");
        return yemotSayAndListen(phrases.leave_message_prompt);
      }
      if (intent === 1 || intent === 2) {
        // wantsToBookNow was already checked above (before detectMenuIntent)
        // — reaching here means she only asked about pricing/info, not a
        // booking yet, so the short info blurb is the right answer.
        const blurb = intent === 1 ? phrases.studio_blurb : phrases.props_blurb;
        const text = `${blurb} ${phrases.anything_else}`;
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
        return yemotSayAndListen(text);
      }
      // No keyword matched — this was very likely a real question, not a
      // failed menu pick. Just answer it.
      return await runOpenTurn(speech);
    }

    // ---- Stage 2: option 4's own sub-choice (hear it all vs. ask something) ----
    if (stage === "guide_choice") {
      if (wantsFullGuide(speech)) {
        const text = `${phrases.full_guide_spoken} ${phrases.anything_else}`;
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
        return yemotSayAndListen(text);
      }
      // Not "tell me everything" — treat it as a real question and let the
      // AI answer it (it already has the full guide in SYSTEM).
      return await runOpenTurn(speech);
    }

    // ---- Stage 2b: "leave a message" — collect it and email it for real ----
    if (stage === "leaving_message") {
      // Per explicit request: confirm what ACTUALLY happened, not a canned
      // "it was sent" regardless of outcome — phrases.leave_message_thanks
      // itself now says explicitly the email went out, so this only plays
      // it when that's actually true; on a real send failure, a distinct
      // (non-admin-editable, matches the AI tool's own fallback wording)
      // phrase is used instead, which never claims the email succeeded.
      const result = await sendMessageToStudio({ message: speech, callerPhone: phone, context: "התקבל דרך הבוט הטלפוני (ימות המשיח)" });
      const text = result.emailed ? phrases.leave_message_thanks : LEAVE_MESSAGE_EMAIL_FAILED_TEXT;
      await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
      return yemotSayAndListen(text);
    }

    // ---- Stage 3: open conversation (same as before) ----
    return await runOpenTurn(speech);
  } catch (e) {
    console.error("[SWEETBABY] yemot ivr failed", e);
    // Was previously invisible beyond a server log nobody could read — this
    // is exactly the kind of "AI turn keeps failing" report that's
    // impossible to diagnose blindly. Now the real error reaches
    // /admin/notifications, best-effort, never blocking the call itself.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "voice_ai_error",
        title: `⚠️ תקלה בבוט הטלפוני (ימות) — ${callerPhone || "מספר לא ידוע"}`,
        body: { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined, callerPhone },
      });
    } catch (e2) {
      console.error("[SWEETBABY] yemot ivr failure admin_notifications save also failed", e2);
    }
    // A single AI hiccup used to permanently strand the rest of the call in
    // "leaving_message" mode — her next sentence (a real follow-up question)
    // would get swallowed as "the message to leave", which read as the bot
    // getting stuck/breaking. Now: apologize and stay in normal conversation
    // after the FIRST hiccup on a call, and only fall back to offering a
    // message if this is the SECOND failure in a row (checked by whether the
    // last thing we said was already this same error) — real trouble, not a
    // one-off blip.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing } = await supabaseAdmin
        .from("voice_call_sessions")
        .select("messages, from_number")
        .eq("call_sid", callSid)
        .maybeSingle();
      const priorMessages = ((existing?.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
      const phone = existing?.from_number || callerPhone;
      const lastWasError = priorMessages[priorMessages.length - 1]?.content === phrases.temporary_error;
      // Real logs from a live outage showed the AI failing on EVERY turn of
      // a call — with the old logic that meant THIS branch fired repeatedly,
      // re-prompting "leave a message" and re-announcing "your message was
      // sent" several times over in the same call for what was really her
      // just continuing to explain herself in fragments across turns that
      // each independently failed. Track whether a message already went out
      // this call and never repeat that specific prompt/announcement again.
      const alreadyLeftMessage = priorMessages.some(
        (m) => m.role === "assistant" && (m.content === phrases.leave_message_thanks || m.content === LEAVE_MESSAGE_EMAIL_FAILED_TEXT),
      );
      // If she's clearly trying to book — this turn or an earlier one this
      // call — the actually useful move when the AI won't cooperate is to
      // get her the booking anyway: the fixed-question flow below never
      // touches the AI, so it keeps working exactly when the AI doesn't.
      const bookingIntent = noAiBookingEnabled && (wantsToBookNow(speech) || priorMessages.some((m) => m.role === "user" && wantsToBookNow(m.content)));

      if (bookingIntent) {
        const start = await startNoAiBooking(phone, nbInputMode);
        await upsertVoiceSession(supabaseAdmin, {
          call_sid: callSid,
          from_number: phone,
          messages: [...priorMessages, { role: "assistant", content: start.say }],
          stage: start.stage,
          draft_booking: start.draft,
        });
        return start.tap ? yemotSayAndListenTap(start.say, start.tap) : yemotSayAndListen(start.say);
      }

      if (lastWasError && !alreadyLeftMessage) {
        await supabaseAdmin.from("voice_call_sessions").upsert(
          { call_sid: callSid, from_number: phone, messages: [...priorMessages, { role: "assistant", content: phrases.leave_message_prompt }], stage: "leaving_message", updated_at: new Date().toISOString() },
          { onConflict: "call_sid" },
        );
        return yemotSayAndListen(phrases.leave_message_prompt);
      }

      await supabaseAdmin.from("voice_call_sessions").upsert(
        { call_sid: callSid, from_number: phone, messages: [...priorMessages, { role: "assistant", content: phrases.temporary_error }], stage: "chat", updated_at: new Date().toISOString() },
        { onConflict: "call_sid" },
      );
      return yemotSayAndListen(phrases.temporary_error);
    } catch (e2) {
      console.error("[SWEETBABY] yemot ivr fallback-to-message also failed", e2);
      return yemotSayAndHangup(phrases.final_error_hangup);
    }
  }
}
