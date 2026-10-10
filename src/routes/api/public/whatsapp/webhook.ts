import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import {
  fetchWhatsAppMediaInfo,
  downloadWhatsAppMedia,
  WHATSAPP_MEDIA_EXT,
} from "@/lib/whatsapp.server";

// Receives every WhatsApp webhook delivery the Lovable connector gateway
// forwards for the connected number (selected under Connectors → WhatsApp →
// Incoming messages). The path is a contract — the gateway posts only to
// /api/public/whatsapp/webhook. Each delivery carries exactly one Meta
// change; X-Lovable-Event names it (whatsapp.message, whatsapp.status, …).
//
// Flow: verify signature → store the raw delivery in whatsapp_webhook_events
// (durable inbox) → process idempotently → mark processed. A duplicate
// X-Lovable-Delivery reuses its row. Pending rows from earlier failures are
// retried here too, so recovery rides on ordinary webhook traffic.

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

/** Downloads one incoming media attachment and re-hosts it in Supabase Storage (Meta's own media URLs expire after a few minutes). Best-effort — a failure here still lets the message row save (with media_url null) rather than dropping the whole event. */
async function storeIncomingMedia(
  supabaseAdmin: any,
  mediaId: string,
): Promise<{ url: string; type: "image" | "video" | "document" | "audio" } | null> {
  try {
    const info = await fetchWhatsAppMediaInfo(mediaId);
    if (!info) return null;
    const bytes = await downloadWhatsAppMedia(info.url, info.fileSize);
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
  // A unique-constraint hit just means a webhook we already recorded was
  // retried — expected and harmless, not worth logging as an error.
  if (error && !String(error.message ?? "").includes("duplicate key")) {
    console.error("[SWEETBABY] whatsapp incoming message insert failed", error);
  }
}

// Status precedence: a later state must never be overwritten by an older
// one arriving out of order (sent after delivered, etc.).
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

async function handleStatusUpdate(supabaseAdmin: any, status: StatusUpdate) {
  const mapped = ["sent", "delivered", "read", "failed"].includes(status.status)
    ? status.status
    : null;
  if (!mapped) return;
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("status")
    .eq("wa_message_id", status.id)
    .maybeSingle();
  if (!existing) {
    // The outbound row isn't saved yet (callback beat the sender) — leave a
    // marker row so reconciliation can apply the status once it appears.
    await supabaseAdmin.from("whatsapp_messages").insert({
      wa_message_id: status.id,
      direction: "out",
      phone: "unknown",
      body: null,
      status: mapped,
    });
    return;
  }
  if ((STATUS_RANK[existing.status] ?? 0) > STATUS_RANK[mapped]) return;
  const { error } = await supabaseAdmin
    .from("whatsapp_messages")
    .update({ status: mapped, error: status.errors?.[0]?.title ?? null })
    .eq("wa_message_id", status.id);
  if (error) console.error("[SWEETBABY] whatsapp status update failed", error);
}

/** Processes one stored delivery's payload. Unknown event types are stored and acknowledged without further work. */
async function processPayload(supabaseAdmin: any, event: string, payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
  if (event === "whatsapp.message") {
    const contactName: string | null = value.contacts?.[0]?.profile?.name ?? null;
    for (const msg of value.messages ?? []) {
      await handleIncomingMessage(supabaseAdmin, msg, contactName);
    }
  } else if (event === "whatsapp.status") {
    for (const status of value.statuses ?? []) {
      await handleStatusUpdate(supabaseAdmin, status);
    }
  }
  // Anything else (template status updates, errors, smb echoes…) stays in
  // the inbox row as the durable record.
}

async function processEventRow(supabaseAdmin: any, row: any): Promise<void> {
  try {
    await processPayload(supabaseAdmin, row.event, row.payload);
    await supabaseAdmin
      .from("whatsapp_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("id", row.id);
  } catch (e: any) {
    await supabaseAdmin
      .from("whatsapp_webhook_events")
      .update({ processing_error: String(e?.message ?? e) })
      .eq("id", row.id);
    throw e;
  }
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WHATSAPP_API_KEY;
        if (!secret) return new Response("Not configured", { status: 500 });

        const deliveryId = request.headers.get("X-Lovable-Delivery");
        const event = request.headers.get("X-Lovable-Event");
        if (!deliveryId || !event) {
          return new Response("Missing delivery headers", { status: 400 });
        }

        let payload: unknown;
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret,
            maxBodyBytes: 4 * 1024 * 1024,
          });
          payload = verified.payload;
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Durable inbox first — a failed write returns 5xx so the gateway retries.
        const { data: row, error: insertError } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .upsert(
            { delivery_id: deliveryId, event, payload: payload as any },
            { onConflict: "delivery_id", ignoreDuplicates: true },
          )
          .select()
          .maybeSingle();
        if (insertError) {
          console.error("[SWEETBABY] whatsapp inbox write failed", insertError);
          return new Response("Inbox write failed", { status: 500 });
        }

        // Row is null when this delivery id already exists — fetch it and
        // skip processing only if it already completed.
        const eventRow =
          row ??
          (
            await supabaseAdmin
              .from("whatsapp_webhook_events")
              .select()
              .eq("delivery_id", deliveryId)
              .maybeSingle()
          ).data;
        if (!eventRow) return new Response("Inbox write failed", { status: 500 });

        try {
          if (!eventRow.processed_at) await processEventRow(supabaseAdmin, eventRow);
        } catch {
          return new Response("Processing failed", { status: 500 });
        }

        // Recovery: pick up a small batch of earlier deliveries still
        // pending (failed before), so unfinished work retries on ordinary
        // webhook traffic instead of staying stuck forever.
        const { data: pending } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .select()
          .is("processed_at", null)
          .order("received_at", { ascending: true })
          .limit(5);
        for (const p of pending ?? []) {
          await processEventRow(supabaseAdmin, p).catch(() => {});
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
});
