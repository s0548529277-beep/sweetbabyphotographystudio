import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseYemotParams, yemotAck, yemotSayAndHangup, yemotSayAndListen } from "@/lib/yemot.server";
import { runVoiceTurn, type VoiceMessage, type VoiceTurnResult } from "@/lib/voice-chat.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";
import { detectMenuIntent, wantsFullGuide } from "@/lib/voice-menu.server";
import { getPhraseMap } from "@/lib/voice-phrases.server";
import { personalizedGreeting } from "@/lib/voice-caller.server";
import { consumePendingVoiceNotification } from "@/lib/voice-pending-notification.server";

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
  const phrases = await getPhraseMap();

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!speech) {
      const { data: existing } = await supabaseAdmin.from("voice_call_sessions").select("stage").eq("call_sid", callSid).maybeSingle();
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
      // Mid-call with no speech heard (silence/timeout) — re-prompt without resetting the conversation.
      return yemotSayAndListen(phrases.didnt_hear);
    }

    const { data: session } = await supabaseAdmin
      .from("voice_call_sessions")
      .select("messages, from_number, stage")
      .eq("call_sid", callSid)
      .maybeSingle();

    // No session row (e.g. Yemot re-asked without ever hitting us fresh) —
    // treat like "didn't catch that" rather than starting a whole new
    // greeting mid-conversation.
    if (!session) return yemotSayAndListen(phrases.didnt_hear);

    const priorMessages = ((session.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
    const phone = session.from_number || callerPhone;
    const stage = (session as { stage?: string }).stage ?? "menu";

    const save = (messages: VoiceMessage[], newStage: string) =>
      supabaseAdmin.from("voice_call_sessions").upsert(
        { call_sid: callSid, from_number: phone, messages, stage: newStage, updated_at: new Date().toISOString() },
        { onConflict: "call_sid" },
      );

    // Runs a real AI turn and replies with the right directive for whatever
    // the model decided to do — shared by every stage that can fall through
    // into the open conversation.
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

    // ---- Stage 1: the spoken-keyword menu ----
    if (stage === "menu") {
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
        const blurb = intent === 1 ? phrases.studio_blurb : phrases.props_blurb;
        const text = `${blurb} ${phrases.anything_else}`;
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
        return yemotSayAndListen(text);
      }
      // No keyword matched — this was very likely a real question, not a
      // failed menu pick. Just answer it.
      return runOpenTurn(speech);
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
      return runOpenTurn(speech);
    }

    // ---- Stage 2b: "leave a message" — collect it and email it for real ----
    if (stage === "leaving_message") {
      await sendMessageToStudio({ message: speech, callerPhone: phone, context: "התקבל דרך הבוט הטלפוני (ימות המשיח)" });
      await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.leave_message_thanks }], "chat");
      return yemotSayAndListen(phrases.leave_message_thanks);
    }

    // ---- Stage 3: open conversation (same as before) ----
    return runOpenTurn(speech);
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

      if (lastWasError) {
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
