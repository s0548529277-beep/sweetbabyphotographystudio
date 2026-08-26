import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/** Every customer-chat-widget conversation, not just ones that led to a booking — see customer_chat_logs. */
export const listChatLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("customer_chat_logs")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Every phone-call conversation with the voice bot, both lines (Twilio and
 * Yemot — the row's call_sid is prefixed "yemot:" for the second line, plain
 * for Twilio) — same transcript shape as customer_chat_logs, just keyed by
 * call instead of by browser-tab session.
 */
export const listVoiceCallLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("voice_call_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
