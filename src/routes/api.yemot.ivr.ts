import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseYemotParams, yemotAck, yemotSayAndHangup, yemotSayAndListen, yemotSayAndListenTap } from "@/lib/yemot.server";
import { runVoiceTurn, type VoiceMessage, type VoiceTurnResult } from "@/lib/voice-chat.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";
import { detectMenuIntent, wantsFullGuide, wantsToBookNow } from "@/lib/voice-menu.server";
import { getVoiceBotConfig } from "@/lib/voice-phrases.server";
import { personalizedGreeting } from "@/lib/voice-caller.server";
import { consumePendingVoiceNotification } from "@/lib/voice-pending-notification.server";
import { startNoAiBooking, continueNoAiBooking, currentNbQuestion, isNbStage, NB_TAP_STAGES, type DraftBooking, type NbInputMode } from "@/lib/voice-noai-booking.server";

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
  const { phrases, menuMode, noAiBookingMode } = await getVoiceBotConfig();
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

    if (!hasAnswer) {
      const existing = await selectVoiceSession(supabaseAdmin, callSid);
      if (!existing) {
        // Genuinely the first hit of the call — no session yet. If there's a
        // message waiting for this number (a booking confirmation/reminder
        // that was only "flash"-rung, not actually spoken, to avoid Yemot
        // units — see campaign.server.ts), play it now, once, before the
        // normal greeting+menu — this is the real delivery of that message.
        const pending = await consumePendingVoiceNotification(callerPhone);
        // If the caller's number matches a real site account, personalize
        // with her name — best-effort, falls back to the plain greeting.
        const greetingWithMenu = await personalizedGreeting(`${phrases.greeting} ${phrases.menu_prompt}`, callerPhone);
        const fullGreeting = pending ? `${pending} ${greetingWithMenu}` : greetingWithMenu;
        await supabaseAdmin.from("voice_call_sessions").upsert(
          { call_sid: callSid, from_number: callerPhone, messages: [{ role: "assistant", content: fullGreeting }], stage: "menu", updated_at: new Date().toISOString() },
          { onConflict: "call_sid" },
        );
        return yemotSayAndListen(fullGreeting);
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
        await (supabaseAdmin.from("voice_call_sessions") as any).upsert(
          { call_sid: callSid, from_number: phone, messages: priorMessages, stage: existingStage, draft_booking: draft, updated_at: new Date().toISOString() },
          { onConflict: "call_sid" },
        );
        return q.tap ? yemotSayAndListenTap(q.say, q.tap) : yemotSayAndListen(q.say);
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

    // draft_booking is a brand-new column (voice-noai-booking.server.ts) —
    // not yet in the generated Supabase types, same stale-types gap as
    // every other `as never`/`as any` cast in this codebase; see
    // ai-bot-efficiency skill for the pattern this follows.
    const save = (messages: VoiceMessage[], newStage: string, draft?: DraftBooking | null) =>
      (supabaseAdmin.from("voice_call_sessions") as any).upsert(
        { call_sid: callSid, from_number: phone, messages, stage: newStage, draft_booking: draft ?? null, updated_at: new Date().toISOString() },
        { onConflict: "call_sid" },
      );

    // Responds with one turn of the no-AI booking flow (voice-noai-
    // booking.server.ts) — shared by both ways into it: the explicit
    // "book now" phrasing in fixed-menu mode, and the automatic escalation
    // when the AI keeps failing but she's clearly trying to book (see the
    // catch block below).
    const respondNbStart = async (userText: string): Promise<Response> => {
      const start = await startNoAiBooking(phone, nbInputMode);
      await save([...priorMessages, { role: "user", content: userText }, { role: "assistant", content: start.say }], start.stage, start.draft);
      return start.tap ? yemotSayAndListenTap(start.say, start.tap) : yemotSayAndListen(start.say);
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
      const { text, action }: VoiceTurnResult = await runVoiceTurn(messages, phone);
      const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];
      if (action === "transfer") {
        // A live transfer (routing_yemot) needs a real extension configured
        // on Yemot's side pointing at a phone number — confirmed live that
        // it isn't set up ("השלוחה אליה ביקשתם לעבור אינה פעילה עקב חוסר
        // בהגדרות"), so this line always offers a message instead of
        // attempting a transfer that's known to fail. Twilio's Dial verb
        // (api.voice.respond.ts) doesn't have this dependency.
        await save([...updatedMessages, { role: "assistant", content: phrases.no_human_transfer }], "leaving_message");
        return yemotSayAndListen(`${text} ${phrases.no_human_transfer}`);
      }
      await save(updatedMessages, "chat");
      if (action === "hangup") return yemotSayAndHangup(text);
      return yemotSayAndListen(text);
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

    // ---- Stage 1: the spoken-keyword menu ----
    if (stage === "menu") {
      // "ai" mode (see MENU_MODE_KEY's doc comment): skip the canned-phrase
      // keyword routing entirely — every stage-1 utterance goes straight
      // into the real AI conversation, which already knows all the same
      // facts (pricing, hours, policies in SYSTEM; arrival/equipment guide
      // via on-demand tools). "fixed" mode (the admin-toggleable revert)
      // keeps the exact original behavior below unchanged.
      if (menuMode === "ai") return await runOpenTurn(speech);

      // Checked BEFORE detectMenuIntent, independent of its word-count gate
      // (looksLikeMenuPick caps at 4 words) — a longer, natural sentence
      // like "אני רוצה לעשות הזמנת סטודיו למחר בבוקר" used to fall through
      // detectMenuIntent entirely (null: too many words) straight to
      // runOpenTurn below, which means "fixed" mode's whole AI-avoidance
      // point was defeated for exactly the sentences that most clearly
      // signal "book now". Checking here first closes that gap for every
      // phrasing wantsToBookNow recognizes, not just the short ones that
      // also happen to classify as menu intent 1/2.
      if (noAiBookingEnabled && wantsToBookNow(speech)) return await respondNbStart(speech);

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
      await sendMessageToStudio({ message: speech, callerPhone: phone, context: "התקבל דרך הבוט הטלפוני (ימות המשיח)" });
      await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.leave_message_thanks }], "chat");
      return yemotSayAndListen(phrases.leave_message_thanks);
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
      const alreadyLeftMessage = priorMessages.some((m) => m.role === "assistant" && m.content === phrases.leave_message_thanks);
      // If she's clearly trying to book — this turn or an earlier one this
      // call — the actually useful move when the AI won't cooperate is to
      // get her the booking anyway: the fixed-question flow below never
      // touches the AI, so it keeps working exactly when the AI doesn't.
      const bookingIntent = noAiBookingEnabled && (wantsToBookNow(speech) || priorMessages.some((m) => m.role === "user" && wantsToBookNow(m.content)));

      if (bookingIntent) {
        const start = await startNoAiBooking(phone, nbInputMode);
        await (supabaseAdmin.from("voice_call_sessions") as any).upsert(
          { call_sid: callSid, from_number: phone, messages: [...priorMessages, { role: "assistant", content: start.say }], stage: start.stage, draft_booking: start.draft, updated_at: new Date().toISOString() },
          { onConflict: "call_sid" },
        );
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
