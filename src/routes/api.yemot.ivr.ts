import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  parseYemotParams,
  yemotAck,
  yemotSayAndHangup,
  yemotSayAndListen,
  yemotSayAndListenDigit,
  yemotSayAndTransfer,
} from "@/lib/yemot.server";
import { runVoiceTurn, type VoiceMessage } from "@/lib/voice-chat.server";
import {
  ARRIVAL_SPOKEN,
  FULL_GUIDE_SPOKEN,
  GUIDE_CHOICE_PROMPT,
  MENU_DIDNT_CATCH,
  MENU_PROMPT,
  PROPS_BLURB,
  STUDIO_BLURB,
  parseMenuChoice,
  wantsFullGuide,
} from "@/lib/voice-menu.server";

const GREETING = "שלום, הגעת לסטודיו סוויט בייבי, איתך בוט Sweetbaby.";
const DIDNT_HEAR = "לא הבנתי, אפשר לחזור על זה?";
const NO_HUMAN_AVAILABLE = "מצטער, כרגע אי אפשר להעביר אותך לנציגה. נציגת הסטודיו תחזור אליך טלפונית בהקדם האפשרי. תודה ולהתראות!";
const ANYTHING_ELSE = "יש עוד משהו שאפשר לעזור בו?";

// One extension in ימות המשיח, configured as a "שלוחת API" pointing here —
// unlike Twilio's two-URL pattern (incoming call vs. gather response),
// Yemot re-hits this exact same URL for every turn of the call, so this
// handler covers the whole conversation: the first hit has no `speech`/
// `digit` field yet (greet + start listening), every later hit carries the
// caller's transcribed reply or key press in it. Sessions are keyed in the
// same voice_call_sessions table the Twilio line uses, under a "yemot:"-
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

  const digit = (params.digit ?? "").trim();
  const speech = (params.speech ?? "").trim();

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!digit && !speech) {
      // First hit of the call — no session yet. Present the fixed menu.
      const greetingWithMenu = `${GREETING} ${MENU_PROMPT}`;
      await supabaseAdmin.from("voice_call_sessions").upsert(
        { call_sid: callSid, from_number: callerPhone, messages: [{ role: "assistant", content: greetingWithMenu }], stage: "menu", updated_at: new Date().toISOString() },
        { onConflict: "call_sid" },
      );
      return yemotSayAndListenDigit(greetingWithMenu);
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

    // ---- Stage 1: the fixed key-press menu ----
    if (stage === "menu") {
      const choice = parseMenuChoice(digit, speech);
      if (!choice) {
        await save(priorMessages, "menu");
        // Fall back to voice for the retry — a digit-press read isn't
        // confirmed reliable yet on this line, so let her just say it.
        return yemotSayAndListen(MENU_DIDNT_CATCH);
      }
      if (choice === 3) {
        const text = `${ARRIVAL_SPOKEN} ${ANYTHING_ELSE}`;
        await save([...priorMessages, { role: "assistant", content: text }], "chat");
        return yemotSayAndListen(text);
      }
      if (choice === 4) {
        await save([...priorMessages, { role: "assistant", content: GUIDE_CHOICE_PROMPT }], "guide_choice");
        return yemotSayAndListen(GUIDE_CHOICE_PROMPT);
      }
      const blurb = choice === 1 ? STUDIO_BLURB : choice === 2 ? PROPS_BLURB : "";
      const text = blurb ? `${blurb} ${ANYTHING_ELSE}` : ANYTHING_ELSE;
      await save([...priorMessages, { role: "assistant", content: text }], "chat");
      return yemotSayAndListen(text);
    }

    // ---- Stage 2: option 4's own sub-choice (hear it all vs. ask something) ----
    if (stage === "guide_choice") {
      if (!speech) return yemotSayAndListen(GUIDE_CHOICE_PROMPT);
      if (wantsFullGuide(speech)) {
        const text = `${FULL_GUIDE_SPOKEN} ${ANYTHING_ELSE}`;
        await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
        return yemotSayAndListen(text);
      }
      const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: speech }];
      const { text, action } = await runVoiceTurn(messages, phone);
      const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];
      await save(updatedMessages, "chat");
      if (action === "hangup") return yemotSayAndHangup(text);
      return yemotSayAndListen(text);
    }

    // ---- Stage 3: open conversation (same as before) ----
    if (!speech) return yemotSayAndListen(DIDNT_HEAR);

    const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: speech }];
    const { text, action } = await runVoiceTurn(messages, phone);
    const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];
    await save(updatedMessages, "chat");

    if (action === "transfer") {
      const humanPhone = process.env.STUDIO_OWNER_PHONE;
      if (!humanPhone) return yemotSayAndHangup(`${text} ${NO_HUMAN_AVAILABLE}`);
      return yemotSayAndTransfer(text, humanPhone);
    }
    if (action === "hangup") return yemotSayAndHangup(text);
    return yemotSayAndListen(text);
  } catch (e) {
    console.error("[SWEETBABY] yemot ivr failed", e);
    return yemotSayAndHangup("מצטער, נתקלנו בתקלה. נציגת הסטודיו תחזור אליך טלפונית. תודה ולהתראות!");
  }
}
