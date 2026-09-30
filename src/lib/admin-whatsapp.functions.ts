import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWhatsAppText, sendWhatsAppMedia, type WhatsAppMediaType } from "@/lib/whatsapp.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/** Whether the required env vars are set — lets the admin page show a setup banner instead of failing on the first send. Never leaks the actual values. */
export const getWhatsAppConfigStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return {
      configured: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    };
  });

/**
 * One row per distinct phone number, each the newest message from/to it —
 * the inbox list on the left of /admin/whatsapp. whatsapp_messages has no
 * separate "conversations" table (kept simple, same spirit as
 * customer_chat_logs/voice_call_sessions elsewhere in this app), so this
 * groups client-side over the last 500 messages rather than adding a view —
 * plenty for how much volume a single studio's WhatsApp line sees.
 */
export const listWhatsAppConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const byPhone = new Map<string, any>();
    for (const row of rows) {
      if (!byPhone.has(row.phone)) byPhone.set(row.phone, row);
    }
    return Array.from(byPhone.values());
  });

export const listWhatsAppThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("phone", data.phone)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Sends a text message and records it — uses supabaseAdmin (service role) for the insert, same "all writes to this table go through service_role" contract as the webhook, so there's no authenticated-insert RLS policy to maintain. */
export const sendWhatsAppMessageAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ phone: z.string().min(1), body: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { wamid } = await sendWhatsAppText(data.phone, data.body);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
      wa_message_id: wamid,
      direction: "out",
      phone: data.phone,
      body: data.body,
      status: "sent",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends a photo/video/document by URL (already uploaded to Supabase Storage by the admin UI) and records it. */
export const sendWhatsAppMediaAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone: z.string().min(1),
        mediaUrl: z.string().url(),
        mediaType: z.enum(["image", "video", "document"]),
        caption: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { wamid } = await sendWhatsAppMedia(
      data.phone,
      data.mediaType as WhatsAppMediaType,
      data.mediaUrl,
      data.caption,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
      wa_message_id: wamid,
      direction: "out",
      phone: data.phone,
      body: data.caption ?? null,
      media_url: data.mediaUrl,
      media_type: data.mediaType,
      status: "sent",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
