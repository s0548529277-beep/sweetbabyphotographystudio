import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  verifyWhatsAppSignature,
  fetchWhatsAppMediaInfo,
  downloadWhatsAppMedia,
  WHATSAPP_MEDIA_EXT,
} from "@/lib/whatsapp.server";

// Registered once as the WhatsApp Business Platform webhook (Meta App
// dashboard → WhatsApp → Configuration → Callback URL = this route's full
// URL, Verify token = WHATSAPP_VERIFY_TOKEN). Meta calls GET exactly once,
// at registration time, to confirm we own this URL; every real message/
// status update after that is a POST. See /admin/whatsapp for the full
// setup walkthrough shown to the studio owner.

type IncomingMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  video?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string };
  audio?: { id: string };
};

type StatusUpdate = {
  id: string;
  status: string;
  errors?: { title?: string }[];
};

/** Downloads one incoming media attachment and re-hosts it in Supabase Storage (Meta's own media URLs expire after a few minutes). Best-effort — a failure here still lets the message row save (with media_url null) rather than dropping the whole webhook event. */
async function storeIncomingMedia(
  supabaseAdmin: any,
  mediaId: string,
): Promise<{ url: string; type: "image" | "video" | "document" | "audio" } | null> {
  try {
    const info = await fetchWhatsAppMediaInfo(mediaId);
    if (!info) return null;
    const bytes = await downloadWhatsAppMedia(info.url);
    if (!bytes) return null;
    const ext = WHATSAPP_MEDIA_EXT[info.mimeType] ?? "bin";
    const path = `whatsapp/${mediaId}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("items")
      .upload(path, bytes, { contentType: info.mimeType, upsert: true });
    if (error) throw error;
    const { data } = await supabaseAdmin.storage
      .from("items")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (!data?.signedUrl) return null;
    const type = info.mimeType.startsWith("image/")
      ? "image"
      : info.mimeType.startsWith("video/")
        ? "video"
        : info.mimeType.startsWith("audio/")
          ? "audio"
          : "document";
    return { url: data.signedUrl, type };
  } catch (e) {
    console.error("[SWEETBABY] whatsapp incoming media download failed", e);
    return null;
  }
}

async function handleIncomingMessage(
  supabaseAdmin: any,
  msg: IncomingMessage,
  contactName: string | null,
) {
  let body: string | null = null;
  let media: { url: string; type: "image" | "video" | "document" | "audio" } | null = null;

  if (msg.type === "text") {
    body = msg.text?.body ?? null;
  } else if (msg.type === "image" && msg.image) {
    body = msg.image.caption ?? null;
    media = await storeIncomingMedia(supabaseAdmin, msg.image.id);
  } else if (msg.type === "video" && msg.video) {
    body = msg.video.caption ?? null;
    media = await storeIncomingMedia(supabaseAdmin, msg.video.id);
  } else if (msg.type === "document" && msg.document) {
    body = msg.document.caption ?? msg.document.filename ?? null;
    media = await storeIncomingMedia(supabaseAdmin, msg.document.id);
  } else if (msg.type === "audio" && msg.audio) {
    media = await storeIncomingMedia(supabaseAdmin, msg.audio.id);
  } else {
    // Unsupported type for now (location, contacts, reactions, stickers…) — still logged so nothing silently vanishes.
    body = `[הודעה מסוג ${msg.type} — עדיין לא נתמך בתצוגה]`;
  }

  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    wa_message_id: msg.id,
    direction: "in",
    phone: msg.from,
    contact_name: contactName,
    body,
    media_url: media?.url ?? null,
    media_type: media?.type ?? null,
    status: "received",
  });
  // A unique-constraint hit just means Meta retried a webhook we already
  // recorded — expected and harmless, not worth logging as an error.
  if (error && !String(error.message ?? "").includes("duplicate key")) {
    console.error("[SWEETBABY] whatsapp incoming message insert failed", error);
  }
}

async function handleStatusUpdate(supabaseAdmin: any, status: StatusUpdate) {
  const mapped = ["sent", "delivered", "read", "failed"].includes(status.status)
    ? status.status
    : null;
  if (!mapped) return;
  const { error } = await supabaseAdmin
    .from("whatsapp_messages")
    .update({ status: mapped, error: status.errors?.[0]?.title ?? null })
    .eq("wa_message_id", status.id);
  if (error) console.error("[SWEETBABY] whatsapp status update failed", error);
}

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && expected && token === expected && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const valid = await verifyWhatsAppSignature(
          rawBody,
          request.headers.get("x-hub-signature-256"),
        );
        if (!valid) return new Response("Forbidden", { status: 403 });

        // Always ack quickly with 200 even if something inside fails —
        // returning a non-200 makes Meta re-deliver the same event
        // repeatedly, same contract as every other webhook in this app.
        try {
          const payload = JSON.parse(rawBody);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
              const value = change.value ?? {};
              const contactName: string | null = value.contacts?.[0]?.profile?.name ?? null;
              for (const msg of value.messages ?? []) {
                await handleIncomingMessage(supabaseAdmin, msg, contactName);
              }
              for (const status of value.statuses ?? []) {
                await handleStatusUpdate(supabaseAdmin, status);
              }
            }
          }
        } catch (e) {
          console.error("[SWEETBABY] whatsapp webhook processing failed", e);
        }
        return new Response("OK", { status: 200 });
      },
    },
  },
});
