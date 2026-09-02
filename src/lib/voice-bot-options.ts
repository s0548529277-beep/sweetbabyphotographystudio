// Plain shared constants for the phone voice bot's TTS voice setting — safe
// to import from both client and server code. The server-only resolution
// logic (reads app_settings, touches supabaseAdmin) lives separately in
// voice-settings.server.ts, which must never be imported from client-
// rendered route components (this project's server functions/`.server.ts`
// files are a hard client/server boundary — importing one from client code
// breaks the build).

export const VOICE_OPTIONS = ["default", "female", "male"] as const;
export type VoiceBotVoiceOption = (typeof VOICE_OPTIONS)[number];

export const VOICE_OPTION_LABELS: Record<VoiceBotVoiceOption, string> = {
  default: "ברירת המחדל של Twilio (המצב לפני שהוגדר קול)",
  female: "קול אישה (Google.he-IL-Wavenet-C)",
  male: "קול גבר (Google.he-IL-Wavenet-D)",
};

// Google's Hebrew WaveNet voices, used via Twilio's `voice` attribute on
// <Say> — Twilio proxies non-English TTS through Google Cloud voices this
// way; there's no direct Google Cloud TTS API call anywhere in this repo.
// "default" omits the `voice` attribute entirely, i.e. Twilio's own
// standard he-IL voice (the behavior before this setting existed).
export const VOICE_NAME: Record<VoiceBotVoiceOption, string | null> = {
  default: null,
  female: "Google.he-IL-Wavenet-C",
  male: "Google.he-IL-Wavenet-D",
};

export function isVoiceOption(value: unknown): value is VoiceBotVoiceOption {
  return typeof value === "string" && (VOICE_OPTIONS as readonly string[]).includes(value);
}
