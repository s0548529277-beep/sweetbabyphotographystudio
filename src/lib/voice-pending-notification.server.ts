// Server-only: a lightweight "message waiting for you" mailbox keyed by
// phone number — see the matching comment in the pending_voice_notifications
// migration for the full idea. Best-effort throughout: a failure here must
// never block a booking confirmation or break an incoming call, it just
// means the customer won't get the callback-delivered message this once.

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9);
}

/** Stores (or replaces) the message waiting for this phone number. */
export async function setPendingVoiceNotification(phone: string, message: string): Promise<void> {
  const key = normalizePhone(phone);
  if (!key) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("pending_voice_notifications")
      .upsert({ phone: key, message, created_at: new Date().toISOString() }, { onConflict: "phone" });
  } catch (e) {
    console.error("[SWEETBABY] setPendingVoiceNotification failed", e);
  }
}

/** Returns and clears the pending message for this phone, if any — delivered exactly once, on her next call in. */
export async function consumePendingVoiceNotification(phone: string): Promise<string | null> {
  const key = normalizePhone(phone);
  if (!key) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("pending_voice_notifications").select("message").eq("phone", key).maybeSingle();
    if (!data) return null;
    await supabaseAdmin.from("pending_voice_notifications").delete().eq("phone", key);
    return data.message as string;
  } catch (e) {
    console.error("[SWEETBABY] consumePendingVoiceNotification failed", e);
    return null;
  }
}
