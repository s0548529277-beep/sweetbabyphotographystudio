import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_PHRASES, PHRASE_LABELS, type PhraseKey } from "@/lib/voice-phrases.server";

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
