import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BOT_VOICE_GENDER_KEY,
  DEFAULT_PHRASES,
  MENU_MODE_KEY,
  NOAI_BOOKING_ENABLED_KEY,
  PHRASE_LABELS,
  THINKING_FILLER_KEY,
  type BotVoiceGender,
  type NoAiBookingMode,
  type PhraseKey,
  type ThinkingFillerMode,
  type VoiceMenuMode,
} from "@/lib/voice-phrases.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

export type VoiceBotPhraseRow = {
  key: PhraseKey;
  label: string;
  value: string;
  isDefault: boolean;
  defaultValue: string;
};

/** Every phone-bot phrase, DB override merged over the shipped default — same resolution the live webhook routes use (getPhraseMap), so what's shown here is exactly what's live. */
export const listVoiceBotPhrases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VoiceBotPhraseRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("voice_bot_phrases").select("key, value");
    if (error) throw new Error(error.message);
    const overrides = new Map<string, string>((data ?? []).map((r: any) => [r.key, r.value]));
    return (Object.keys(DEFAULT_PHRASES) as PhraseKey[]).map((key) => {
      const defaultValue = DEFAULT_PHRASES[key];
      const override = overrides.get(key);
      return {
        key,
        label: PHRASE_LABELS[key],
        value: override ?? defaultValue,
        isDefault: override === undefined,
        defaultValue,
      };
    });
  });

export const updateVoiceBotPhrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1), value: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!(data.key in DEFAULT_PHRASES)) throw new Error("מפתח לא מוכר");
    const { error } = await context.supabase
      .from("voice_bot_phrases")
      .upsert({ key: data.key, value: data.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Deletes the override row so the phrase goes back to the shipped default. */
export const resetVoiceBotPhrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("voice_bot_phrases").delete().eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Which "menu" stage behavior the live call uses — see MENU_MODE_KEY's own doc comment in voice-phrases.server.ts. */
export const getVoiceMenuMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VoiceMenuMode> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("voice_bot_phrases").select("value").eq("key", MENU_MODE_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value === "fixed" ? "fixed" : "ai";
  });

export const setVoiceMenuMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["ai", "fixed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("voice_bot_phrases")
      .upsert({ key: MENU_MODE_KEY, value: data.mode, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Which input mode the no-AI, fixed-question booking flow (voice-noai-booking.server.ts) uses on live calls — see NOAI_BOOKING_ENABLED_KEY's own doc comment. */
export const getNoAiBookingMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NoAiBookingMode> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("voice_bot_phrases").select("value").eq("key", NOAI_BOOKING_ENABLED_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value === "off" || data?.value === "dtmf" ? data.value : "speech";
  });

export const setNoAiBookingMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["off", "speech", "dtmf"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("voice_bot_phrases")
      .upsert({ key: NOAI_BOOKING_ENABLED_KEY, value: data.mode, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Which grammatical gender the bot speaks itself in — see BOT_VOICE_GENDER_KEY's doc comment in voice-phrases.server.ts for the full picture (this only fixes the bot's own WORDING; the acoustic TTS voice sound is a separate, Yemot-side setting). */
export const getBotVoiceGender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotVoiceGender> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("voice_bot_phrases").select("value").eq("key", BOT_VOICE_GENDER_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value === "male" ? "male" : "female";
  });

export const setBotVoiceGender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ gender: z.enum(["male", "female"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("voice_bot_phrases")
      .upsert({ key: BOT_VOICE_GENDER_KEY, value: data.gender, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Whether the "thinking filler" (say something right away, then do the real AI work on the follow-up hit) is on for the Yemot line — see THINKING_FILLER_KEY's doc comment in voice-phrases.server.ts. Twilio's channel is unaffected — its <Gather> only ever runs one directive shape, not Yemot's two-hit id_list_message re-continue. */
export const getThinkingFillerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ThinkingFillerMode> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("voice_bot_phrases").select("value").eq("key", THINKING_FILLER_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value === "on" ? "on" : "off";
  });

export const setThinkingFillerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["on", "off"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("voice_bot_phrases")
      .upsert({ key: THINKING_FILLER_KEY, value: data.mode, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type NoAiBookingSessionRow = {
  callSid: string;
  phone: string;
  stage: string;
  draft: Record<string, any> | null;
  updatedAt: string;
};

/**
 * Recent calls that entered the no-AI booking flow (voice-noai-
 * booking.server.ts) — identified by draft_booking not being null, since
 * that column is only ever written while a call is inside this specific
 * flow. Lets the studio see who started a phone booking this way, whether
 * she finished it (stage "chat"/"nb_confirm" done — a completed booking
 * itself shows up in the normal bookings/calendar views, this is about
 * spotting an ABANDONED attempt worth a follow-up call) or got stuck
 * re-asking the same question (stage stayed on one nb_ step across
 * updates).
 */
export const listNoAiBookingSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NoAiBookingSessionRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase.from("voice_call_sessions") as any)
      .select("call_sid, from_number, stage, draft_booking, updated_at")
      .not("draft_booking", "is", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      callSid: r.call_sid,
      phone: r.from_number ?? "",
      stage: r.stage ?? "",
      draft: r.draft_booking ?? null,
      updatedAt: r.updated_at,
    }));
  });
