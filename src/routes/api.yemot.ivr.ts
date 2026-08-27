import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseYemotParams, yemotAck, yemotSayAndHangup, yemotSayAndListen, yemotSayAndTransfer } from "@/lib/yemot.server";
import { runVoiceTurn, type VoiceMessage, type VoiceTurnResult } from "@/lib/voice-chat.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";
import {
  ARRIVAL_SPOKEN,
  FULL_GUIDE_SPOKEN,
  GUIDE_CHOICE_PROMPT,
  LEAVE_MESSAGE_PROMPT,
  LEAVE_MESSAGE_THANKS,
  MENU_PROMPT,
  PROPS_BLURB,
  STUDIO_BLURB,
  detectMenuIntent,
  wantsFullGuide,
} from "@/lib/voice-menu.server";

const GREETING = "שלום, הגעת לסטודיו סוויט בייבי, איתך בוט Sweetbaby.";
const DIDNT_HEAR = "לא הבנתי, אפשר לחזור על זה?";
const ANYTHING_ELSE = "יש עוד משהו שאפשר לעזור בו?";
// Whenever a human transfer isn't possible right now, offer to take a real
// message instead of just promising a callback with no record of the call —
// see voice-message.server.ts.
const NO_HUMAN_TRANSFER = `כרגע אי אפשר להעביר אותך לנציגה ישירות. ${LEAVE_MESSAGE_PROMPT}`;

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

  const speech = (params.speech ?? "").trim();

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!speech) {
      const { data: existing } = await supabaseAdmin.from("voice_call_sessions").select("stage").eq("call_sid", callSid).maybeSingle();
      if (!existing) {
        // Genuinely the first hit of the call — no session yet. Greet + present the menu.
        const greetingWithMenu = `${GREETING} ${MENU_PROMPT}`;
        await supabaseAdmin.from("voice_call_sessions").upsert(
          { call_sid: callSid, from_number: callerPhone, messages: [{ role: "assistant", content: greetingWithMenu }], stage: "menu", updated_at: new Date().toISOString() },
          { onConflict: "call_sid" },
        );
        return yemotSayAndListen(greetingWithMenu);
      }
      // Mid-call with no speech heard (silence/timeout) — re-prompt without resetting the conversation.
      return yemotSayAndListen(DIDNT_HEAR);
    }

    const { data: session } = await supabaseAdmin
      .from("voice_call_sessions")
      .select("messages, from_number, stage")
      .eq("call_sid", callSid)
      .maybeSingle();

    // No session row (e.g. Yemot re-asked without ever hitting us fresh) —
    // treat like "didn't catch that" rather than starting a whole new
    // greeting mid-conversation.
    if (!session) return yemotSayAndListen(DIDNT_HEAR);

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
        const humanPhone = process.env.STUDIO_OWNER_PHONE;
        if (!humanPhone) {
          await save([...updatedMessages, { role: "assistant", content: NO_HUMAN_TRANSFER }], "leaving_message");
          return yemotSayAndListen(`${text} ${NO_HUMAN_TRANSFER}`);
        }
        await save(updatedMessages, "chat");
        return yemotSayAndTransfer(text, humanPhone);
      }
      await save(updatedMessages, "chat");
      if (action === "hangup") return yemotSayAndHangup(text);
      return yemotSayAndListen(text);
    };

    // ---- Stage 1: the spoken-keyword menu ----
    if (stage === "menu") {
      const intent = detectMenuIntent(speech);
      if (intent === 3) {
        const text = `${ARRIVAL_SPOKEN} ${ANYTHING_ELSE}`;
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
        return yemotSayAndListen(text);
      }
      if (intent === 4) {
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: GUIDE_CHOICE_PROMPT }], "guide_choice");
        return yemotSayAndListen(GUIDE_CHOICE_PROMPT);
      }
      if (intent === 6) {
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: LEAVE_MESSAGE_PROMPT }], "leaving_message");
        return yemotSayAndListen(LEAVE_MESSAGE_PROMPT);
      }
      if (intent === 1 || intent === 2) {
        const blurb = intent === 1 ? STUDIO_BLURB : PROPS_BLURB;
        const text = `${blurb} ${ANYTHING_ELSE}`;
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
        const text = `${FULL_GUIDE_SPOKEN} ${ANYTHING_ELSE}`;
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
      await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: LEAVE_MESSAGE_THANKS }], "chat");
      return yemotSayAndListen(LEAVE_MESSAGE_THANKS);
    }

    // ---- Stage 3: open conversation (same as before) ----
    return runOpenTurn(speech);
  } catch (e) {
    console.error("[SWEETBABY] yemot ivr failed", e);
    // Best-effort: still offer to leave a message instead of just hanging up
    // on a broken promise of a callback — falls through to a plain hangup
    // if even this fails.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const text = `מצטער, נתקלנו בתקלה זמנית. ${LEAVE_MESSAGE_PROMPT}`;
      await supabaseAdmin.from("voice_call_sessions").upsert(
        { call_sid: callSid, from_number: callerPhone, messages: [{ role: "assistant", content: text }], stage: "leaving_message", updated_at: new Date().toISOString() },
        { onConflict: "call_sid" },
      );
      return yemotSayAndListen(text);
    } catch (e2) {
      console.error("[SWEETBABY] yemot ivr fallback-to-message also failed", e2);
      return yemotSayAndHangup("מצטער, נתקלנו בתקלה. נציגת הסטודיו תחזור אליך טלפונית. תודה ולהתראות!");
    }
  }
}
