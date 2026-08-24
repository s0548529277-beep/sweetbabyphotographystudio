import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseTwilioForm, twimlSayAndDial, twimlSayAndGather, twimlSayAndHangup, verifyTwilioSignature } from "@/lib/twilio.server";
import { runVoiceTurn, type VoiceMessage } from "@/lib/voice-chat.server";

const NO_HUMAN_AVAILABLE =
  "מצטערת, כרגע אי אפשר להעביר אותך לנציג/ה. נציגת הסטודיו תחזור אליך טלפונית בהקדם האפשרי. תודה ולהתראות!";
const DIDNT_HEAR = "לא הבנתי, אפשר לחזור על זה?";

// Called repeatedly by Twilio (as the `action` of each <Gather>) for every
// turn of the call after the initial greeting from /api/voice/incoming.
export const Route = createFileRoute("/api/voice/respond")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await parseTwilioForm(request);
        const valid = await verifyTwilioSignature(request.url, params, request.headers.get("x-twilio-signature"));
        if (!valid) return new Response("Forbidden", { status: 403 });

        const callSid = params.CallSid;
        const speech = (params.SpeechResult ?? "").trim();
        if (!callSid) return new Response("Bad Request", { status: 400 });

        const base = new URL(request.url);
        const actionUrl = `${base.protocol}//${base.host}/api/voice/respond`;

        if (!speech) return twimlSayAndGather(DIDNT_HEAR, actionUrl);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: session } = await supabaseAdmin
            .from("voice_call_sessions")
            .select("messages, from_number")
            .eq("call_sid", callSid)
            .maybeSingle();

          const priorMessages = ((session?.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
          const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: speech }];
          const callerPhone = session?.from_number || params.From || "";

          const { text, action } = await runVoiceTurn(messages, callerPhone);
          const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];

          await supabaseAdmin.from("voice_call_sessions").upsert(
            { call_sid: callSid, from_number: callerPhone, messages: updatedMessages, updated_at: new Date().toISOString() },
            { onConflict: "call_sid" },
          );

          if (action === "transfer") {
            const humanPhone = process.env.STUDIO_OWNER_PHONE;
            if (!humanPhone) return twimlSayAndHangup(`${text} ${NO_HUMAN_AVAILABLE}`);
            return twimlSayAndDial(text, humanPhone);
          }
          if (action === "hangup") return twimlSayAndHangup(text);
          return twimlSayAndGather(text, actionUrl);
        } catch (e) {
          console.error("[SWEETBABY] voice respond failed", e);
          return twimlSayAndHangup("מצטערת, נתקלנו בתקלה. נציגת הסטודיו תחזור אליך טלפונית. תודה ולהתראות!");
        }
      },
    },
  },
});
