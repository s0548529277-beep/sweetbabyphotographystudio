import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseYemotParams, yemotAck, yemotSayAndHangup, yemotSayAndListen, yemotSayAndTransfer } from "@/lib/yemot.server";
import { runVoiceTurn, type VoiceMessage } from "@/lib/voice-chat.server";

const GREETING =
  "שלום, הגעת לסטודיו סוויט בייבי, איתך בוט Sweetbaby. אפשר לשאול אותי על שעות, מחירים, זמינות, או לבקש לשריין תור. איך אפשר לעזור?";
const DIDNT_HEAR = "לא הבנתי, אפשר לחזור על זה?";
const NO_HUMAN_AVAILABLE = "מצטער, כרגע אי אפשר להעביר אותך לנציגה. נציגת הסטודיו תחזור אליך טלפונית בהקדם האפשרי. תודה ולהתראות!";

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
      // First hit of the call — no session yet.
      await supabaseAdmin.from("voice_call_sessions").upsert(
        { call_sid: callSid, from_number: callerPhone, messages: [{ role: "assistant", content: GREETING }], updated_at: new Date().toISOString() },
        { onConflict: "call_sid" },
      );
      return yemotSayAndListen(GREETING);
    }

    const { data: session } = await supabaseAdmin
      .from("voice_call_sessions")
      .select("messages, from_number")
      .eq("call_sid", callSid)
      .maybeSingle();

    // No session row (e.g. Yemot re-asked without ever hitting us fresh) —
    // treat like "didn't catch that" rather than starting a whole new
    // greeting mid-conversation.
    if (!session) return yemotSayAndListen(DIDNT_HEAR);

    const priorMessages = ((session.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
    const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: speech }];
    const phone = session.from_number || callerPhone;

    const { text, action } = await runVoiceTurn(messages, phone);
    const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];

    await supabaseAdmin.from("voice_call_sessions").upsert(
      { call_sid: callSid, from_number: phone, messages: updatedMessages, updated_at: new Date().toISOString() },
      { onConflict: "call_sid" },
    );

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
