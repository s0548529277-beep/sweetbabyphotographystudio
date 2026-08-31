// Admin-editable free-text notes fed into every AI bot's system prompt (see
// getBotKnowledgeText, called from ai.functions.ts's chatWithBot and
// voice-chat.server.ts's runVoiceTurn) — lets an admin add a new fact
// ("newborn session via birth-basket benefit is free") and have it take
// effect on the live bots immediately, no code change needed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

// bot_knowledge_notes is a very recent table — cast past the generated
// types until they're regenerated against the live schema (same pattern
// used for image_hash in admin.items.tsx).

export const listBotKnowledgeNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("bot_knowledge_notes")
      .select("id, content, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; content: string; created_at: string }>;
  });

const addSchema = z.object({ content: z.string().trim().min(1).max(2000) });

export const addBotKnowledgeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any).from("bot_knowledge_notes").insert({ content: data.content });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteBotKnowledgeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any).from("bot_knowledge_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Server-only, called from inside the bots' own request handling (not a
 * createServerFn — no client ever calls this directly). Returns a joined
 * block of every admin-typed note, oldest first, or "" if there are none —
 * best-effort: a DB hiccup here must never take down the whole bot, so any
 * error is logged and swallowed to an empty string.
 */
export async function getBotKnowledgeText(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("bot_knowledge_notes")
      .select("content")
      .order("created_at", { ascending: true });
    if (error || !data?.length) return "";
    return "\n\nמידע נוסף שהוזן ע\"י הצוות (חשוב, תתייחס אליו):\n" + data.map((r: any) => `- ${r.content}`).join("\n");
  } catch (e) {
    console.error("[SWEETBABY] getBotKnowledgeText failed", e);
    return "";
  }
}
