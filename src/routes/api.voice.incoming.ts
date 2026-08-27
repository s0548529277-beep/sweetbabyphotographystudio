import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { parseTwilioForm, twimlSayAndGather, verifyTwilioSignature } from "@/lib/twilio.server";
import { getPhraseMap } from "@/lib/voice-phrases.server";
import { personalizedGreeting } from "@/lib/voice-caller.server";
import { consumePendingVoiceNotification } from "@/lib/voice-pending-notification.server";

// Configured as the Voice webhook on the Twilio phone number (Console →
// Phone Numbers → the number → "A call comes in" → this URL, POST).
export const Route = createFileRoute("/api/voice/incoming")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await parseTwilioForm(request);
        const valid = await verifyTwilioSignature(request.url, params, request.headers.get("x-twilio-signature"));
        if (!valid) return new Response("Forbidden", { status: 403 });

        const callSid = params.CallSid;
        const fromNumber = params.From ?? "";
        if (!callSid) return new Response("Bad Request", { status: 400 });

        const phrases = await getPhraseMap();
        // If there's a message waiting for this number (a booking
        // confirmation/reminder), play it once before the normal greeting —
        // see the matching comment in api.yemot.ivr.ts.
        const pending = await consumePendingVoiceNotification(fromNumber);
        const greetingWithMenu = await personalizedGreeting(`${phrases.greeting} ${phrases.menu_prompt}`, fromNumber);
        const fullGreeting = pending ? `${pending} ${greetingWithMenu}` : greetingWithMenu;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("voice_call_sessions").upsert(
            {
              call_sid: callSid,
              from_number: fromNumber,
              messages: [{ role: "assistant", content: fullGreeting }],
              stage: "menu",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "call_sid" },
          );
        } catch (e) {
          console.error("[SWEETBABY] voice session init failed", e);
        }

        const base = new URL(request.url);
        const actionUrl = `${base.protocol}//${base.host}/api/voice/respond`;
        return twimlSayAndGather(fullGreeting, actionUrl);
      },
    },
  },
});
