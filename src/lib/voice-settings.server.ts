// Resolves the admin-chosen TTS voice for the Twilio phone bot into the
// exact attribute string a <Say> tag needs. The choice itself lives in
// app_settings (key "voice_bot_voice"), editable from /admin/voice-bot —
// see that route for the picker UI and AGENTS.md for the bigger picture.
// Server-only (touches supabaseAdmin) — the plain option constants live in
// voice-bot-options.ts, which the admin picker UI imports instead.

import { VOICE_NAME, isVoiceOption, type VoiceBotVoiceOption } from "./voice-bot-options";

const SETTING_KEY = "voice_bot_voice";

/**
 * Reads the admin's chosen voice from app_settings and returns the full
 * attribute string to interpolate into a <Say ...> tag (language, plus an
 * optional voice attribute). Server-only — called by the Twilio webhook
 * routes (api.voice.incoming.ts / api.voice.respond.ts), never by the
 * client. Falls back to "female" (today's live default) on any read error
 * so a settings-table hiccup can't take the whole phone bot down.
 */
export async function getVoiceBotSayAttrs(): Promise<string> {
  let option: VoiceBotVoiceOption = "female";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // app_settings is a new table — cast until the generated Database type
    // (types.ts) picks it up on next generation.
    const db = supabaseAdmin as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (isVoiceOption(data?.value)) option = data.value;
  } catch (e) {
    console.error("[SWEETBABY] voice bot setting read failed, using default", e);
  }

  const voiceName = VOICE_NAME[option];
  return voiceName ? `language="he-IL" voice="${voiceName}"` : `language="he-IL"`;
}
