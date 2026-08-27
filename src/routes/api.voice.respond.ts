import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseTwilioForm, twimlSayAndDial, twimlSayAndGather, twimlSayAndHangup, verifyTwilioSignature } from "@/lib/twilio.server";
import { runVoiceTurn, type VoiceMessage, type VoiceTurnResult } from "@/lib/voice-chat.server";
import { sendMessageToStudio } from "@/lib/voice-message.server";
import { detectMenuIntent, wantsFullGuide } from "@/lib/voice-menu.server";
import { getPhraseMap } from "@/lib/voice-phrases.server";

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
        const phrases = await getPhraseMap();

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

          // Runs a real AI turn and replies with the right TwiML for
          // whatever the model decided to do — shared by every stage that
          // can fall through into the open conversation, so "transfer with
          // no human available → offer to leave a message instead" only
          // has to be written once.
          const runOpenTurn = async (userText: string): Promise<Response> => {
            const messages: VoiceMessage[] = [...priorMessages, { role: "user", content: userText }];
            const { text, action }: VoiceTurnResult = await runVoiceTurn(messages, callerPhone);
            const updatedMessages: VoiceMessage[] = [...messages, { role: "assistant", content: text }];
            if (action === "transfer") {
              const humanPhone = process.env.STUDIO_OWNER_PHONE;
              if (!humanPhone) {
                await save([...updatedMessages, { role: "assistant", content: phrases.no_human_transfer }], "leaving_message");
                return twimlSayAndGather(`${text} ${phrases.no_human_transfer}`, actionUrl);
              }
              await save(updatedMessages, "chat");
              return twimlSayAndDial(text, humanPhone);
            }
            await save(updatedMessages, "chat");
            if (action === "hangup") return twimlSayAndHangup(text);
            return twimlSayAndGather(text, actionUrl);
          };

          // ---- Stage 1: the spoken-keyword menu ----
          if (stage === "menu") {
            if (!speech) {
              await save(priorMessages, "menu");
              return twimlSayAndGather(phrases.didnt_hear, actionUrl);
            }
            const intent = detectMenuIntent(speech);
            if (intent === 3) {
              const text = `${phrases.arrival_spoken} ${phrases.anything_else}`;
              await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
              return twimlSayAndGather(text, actionUrl);
            }
            if (intent === 4) {
              await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.guide_choice_prompt }], "guide_choice");
              return twimlSayAndGather(phrases.guide_choice_prompt, actionUrl);
            }
            if (intent === 6) {
              await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.leave_message_prompt }], "leaving_message");
              return twimlSayAndGather(phrases.leave_message_prompt, actionUrl);
            }
            if (intent === 1 || intent === 2) {
              const blurb = intent === 1 ? phrases.studio_blurb : phrases.props_blurb;
              const text = `${blurb} ${phrases.anything_else}`;
              await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
              return twimlSayAndGather(text, actionUrl);
            }
            // No keyword matched — this was very likely a real question, not
            // a failed menu pick. Just answer it.
            return runOpenTurn(speech);
          }

          // ---- Stage 2: option 4's own sub-choice (hear it all vs. ask something) ----
          if (stage === "guide_choice") {
            if (!speech) return twimlSayAndGather(phrases.guide_choice_prompt, actionUrl);
            if (wantsFullGuide(speech)) {
              const text = `${phrases.full_guide_spoken} ${phrases.anything_else}`;
              await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: text }], "chat");
              return twimlSayAndGather(text, actionUrl);
            }
            // Not "tell me everything" — treat it as a real question and let
            // the AI answer it (it already has the full guide in SYSTEM).
            return runOpenTurn(speech);
          }

          // ---- Stage 2b: "leave a message" — collect it and email it for real ----
          if (stage === "leaving_message") {
            if (!speech) return twimlSayAndGather(phrases.leave_message_prompt, actionUrl);
            await sendMessageToStudio({ message: speech, callerPhone, context: "התקבל דרך הבוט הטלפוני (טוויליו)" });
            await save([...priorMessages, { role: "user", content: speech }, { role: "assistant", content: phrases.leave_message_thanks }], "chat");
            return twimlSayAndGather(phrases.leave_message_thanks, actionUrl);
          }

          // ---- Stage 3: open conversation (same AI turn as before) ----
          if (!speech) return twimlSayAndGather(phrases.didnt_hear, actionUrl);
          return runOpenTurn(speech);
        } catch (e) {
          console.error("[SWEETBABY] voice respond failed", e);
          // A single AI hiccup used to permanently strand the rest of the
          // call in "leaving_message" mode (and even discard the prior
          // conversation) — her next sentence (a real follow-up) would get
          // swallowed as "the message to leave", which read as the bot
          // getting stuck/breaking. Now: apologize and stay in normal
          // conversation after the FIRST hiccup on a call, keeping the prior
          // messages; only fall back to offering a message on a SECOND
          // failure in a row (the last thing we said was already this same
          // error) — real trouble, not a one-off blip.
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: existing } = await supabaseAdmin
              .from("voice_call_sessions")
              .select("messages, from_number")
              .eq("call_sid", callSid)
              .maybeSingle();
            const priorMessages = ((existing?.messages as VoiceMessage[] | undefined) ?? []) as VoiceMessage[];
            const phone = existing?.from_number || params.From || "";
            const lastWasError = priorMessages[priorMessages.length - 1]?.content === phrases.temporary_error;

            if (lastWasError) {
              await supabaseAdmin.from("voice_call_sessions").upsert(
                { call_sid: callSid, from_number: phone, messages: [...priorMessages, { role: "assistant", content: phrases.leave_message_prompt }], stage: "leaving_message", updated_at: new Date().toISOString() },
                { onConflict: "call_sid" },
              );
              return twimlSayAndGather(phrases.leave_message_prompt, actionUrl);
            }

            await supabaseAdmin.from("voice_call_sessions").upsert(
              { call_sid: callSid, from_number: phone, messages: [...priorMessages, { role: "assistant", content: phrases.temporary_error }], stage: "chat", updated_at: new Date().toISOString() },
              { onConflict: "call_sid" },
            );
            return twimlSayAndGather(phrases.temporary_error, actionUrl);
          } catch (e2) {
            console.error("[SWEETBABY] voice respond fallback-to-message also failed", e2);
            return twimlSayAndHangup(phrases.final_error_hangup);
          }
        }
      },
    },
  },
});
