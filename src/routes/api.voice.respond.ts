import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  parseTwilioForm,
  twimlSayAndDial,
  twimlSayAndGather,
  twimlSayAndGatherMenu,
  twimlSayAndHangup,
  verifyTwilioSignature,
} from "@/lib/twilio.server";
import { runVoiceTurn, type VoiceMessage } from "@/lib/voice-chat.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";
import {
  ARRIVAL_SPOKEN,
  FULL_GUIDE_SPOKEN,
  GUIDE_CHOICE_PROMPT,
  LEAVE_MESSAGE_PROMPT,
  LEAVE_MESSAGE_THANKS,
  MENU_DIDNT_CATCH,
  PROPS_BLURB,
  STUDIO_BLURB,
  parseMenuChoice,
  wantsFullGuide,
} from "@/lib/voice-menu.server";

const DIDNT_HEAR = "לא הבנתי, אפשר לחזור על זה?";
const ANYTHING_ELSE = "יש עוד משהו שאפשר לעזור בו?";
// Whenever a human transfer isn't possible right now, offer to take a real
// message instead of just promising a callback with no record of the call —
// see voice-message.server.ts.
const NO_HUMAN_TRANSFER = `כרגע אי אפשר להעביר אותך לנציג/ה ישירות. ${LEAVE_MESSAGE_PROMPT}`;

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
        const digits = (params.Digits ?? "").trim();
        const speech = (params.SpeechResult ?? "").trim();
        if (!callSid) return new Response("Bad Request", { status: 400 });

        const base = new URL(request.url);
        const actionUrl = `${base.protocol}//${base.host}/api/voice/respond`;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: session } = await supabaseAdmin
            .from("voice_call_sessions")
            .select("messages, from_number, stage")
            .eq("call_sid", callSid)
            .maybeSingle();

          const callerPhone = session?.from_number || params.From || "";
          const priorMessages = ((session?.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
          const stage = (session as { stage?: string } | null)?.stage ?? "menu";

          const save = (messages: VoiceMessage[], newStage: string) =>
            supabaseAdmin.from("voice_call_sessions").upsert(
              { call_sid: callSid, from_number: callerPhone, messages, stage: newStage, updated_at: new Date().toISOString() },
              { onConflict: "call_sid" },
            );

          // ---- Stage 1: the fixed key-press menu ----
          if (stage === "menu") {
            const choice = parseMenuChoice(digits, speech);
            if (!choice) {
              await save(priorMessages, "menu");
              return twimlSayAndGatherMenu(MENU_DIDNT_CATCH, actionUrl);
            }
            if (choice === 3) {
              const text = `${ARRIVAL_SPOKEN} ${ANYTHING_ELSE}`;
              await save([...priorMessages, { role: "assistant", content: text }], "chat");
              return twimlSayAndGather(text, actionUrl);
            }
            if (choice === 4) {
              await save([...priorMessages, { role: "assistant", content: GUIDE_CHOICE_PROMPT }], "guide_choice");
              return twimlSayAndGather(GUIDE_CHOICE_PROMPT, actionUrl);
            }
            if (choice === 6) {
              await save([...priorMessages, { role: "assistant", content: LEAVE_MESSAGE_PROMPT }], "leaving_message");
              return twimlSayAndGather(LEAVE_MESSAGE_PROMPT, actionUrl);
            }
            const blurb = choice === 1 ? STUDIO_BLURB : choice === 2 ? PROPS_BLURB : "";
            const text = blurb ? `${blurb} ${ANYTHING_ELSE}` : ANYTHING_ELSE;
            await save([...priorMessages, { role: "assistant", content: text }], "chat");
            return twimlSayAndGather(text, actionUrl);
          }

          // ---- Stage 2: option 4's own sub-choice (hear it all vs. ask something) ----
          if (stage === "guide_choice") {
            if (!speech) return twimlSayAndGather(GUIDE_CHOICE_PROMPT, actionUrl);
            if (wantsFullGuide(speech)) {
              const text = `${FULL_GUIDE_SPOKEN} ${ANYTHING_ELSE}`;
              await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
              return twimlSayAndGather(text, actionUrl);
            }
            // Not "tell me everything" — treat it as a real question and let
            // the AI answer it (it already has the full guide in SYSTEM).
            const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: speech }];
            const { text, action } = await runVoiceTurn(messages, callerPhone);
            const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];
            await save(updatedMessages, "chat");
            if (action === "hangup") return twimlSayAndHangup(text);
            return twimlSayAndGather(text, actionUrl);
          }

          // ---- Stage 2b: option 6 (or a "no human available" fallback) — collect the message and email it for real ----
          if (stage === "leaving_message") {
            if (!speech) return twimlSayAndGather(LEAVE_MESSAGE_PROMPT, actionUrl);
            await sendMessageToStudio({ message: speech, callerPhone, context: "התקבל דרך התפריט הקולי בטלפון (טוויליו)" });
            await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: LEAVE_MESSAGE_THANKS }], "chat");
            return twimlSayAndGather(LEAVE_MESSAGE_THANKS, actionUrl);
          }

          // ---- Stage 3: open conversation (same AI turn as before) ----
          if (!speech) return twimlSayAndGather(DIDNT_HEAR, actionUrl);

          const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: speech }];
          const { text, action } = await runVoiceTurn(messages, callerPhone);
          const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];
          await save(updatedMessages, "chat");

          if (action === "transfer") {
            const humanPhone = process.env.STUDIO_OWNER_PHONE;
            if (!humanPhone) {
              // No live transfer possible — offer a real message instead of
              // just a promise, same as menu option 6.
              await save([...updatedMessages, { role: "assistant", content: NO_HUMAN_TRANSFER }], "leaving_message");
              return twimlSayAndGather(`${text} ${NO_HUMAN_TRANSFER}`, actionUrl);
            }
            return twimlSayAndDial(text, humanPhone);
          }
          if (action === "hangup") return twimlSayAndHangup(text);
          return twimlSayAndGather(text, actionUrl);
        } catch (e) {
          console.error("[SWEETBABY] voice respond failed", e);
          // Even on an unexpected failure, try to still offer leaving a
          // message rather than just hanging up on a broken promise of a
          // callback — best-effort: if this also fails, fall through to the
          // plain hangup below.
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const text = `מצטער, נתקלנו בתקלה זמנית. ${LEAVE_MESSAGE_PROMPT}`;
            await supabaseAdmin.from("voice_call_sessions").upsert(
              { call_sid: callSid, from_number: params.From || "", messages: [{ role: "assistant", content: text }], stage: "leaving_message", updated_at: new Date().toISOString() },
              { onConflict: "call_sid" },
            );
            return twimlSayAndGather(text, actionUrl);
          } catch (e2) {
            console.error("[SWEETBABY] voice respond fallback-to-message also failed", e2);
            return twimlSayAndHangup("מצטער, נתקלנו בתקלה. נציגת הסטודיו תחזור אליך טלפונית. תודה ולהתראות!");
          }
        }
      },
    },
  },
});
