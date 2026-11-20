import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import {
  fetchWhatsAppMediaInfo,
  downloadWhatsAppMedia,
  mediaExtension,
  normalizeMime,
} from "@/lib/whatsapp.server";
import { runWhatsAppBotReply, runWhatsAppNonTextReply } from "@/lib/whatsapp-bot.server";
import { shouldAlertOwner } from "@/lib/whatsapp-nontext";

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
  sticker?: { id: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string; wa_id?: string }> }>;
  reaction?: { emoji?: string };
};

type StoredMedia = {
  url: string;
  type: "image" | "video" | "document" | "audio";
  filename: string | null;
  mime: string;
};

type StatusUpdate = {
  id: string;
  status: string;
  errors?: { title?: string; code?: number | string }[];
};

/**
 * Downloads one incoming media attachment of ANY type (photo, video, voice note, PDF, Word / Excel / ZIP, text...)
 * and re-hosts it in Supabase Storage (Meta's own media URLs expire after a few minutes). Best-effort — a failure
 * here still lets the message row save (with media_url null and a visible note) rather than dropping the whole event.
 */
async function storeIncomingMedia(
  supabaseAdmin: any,
  mediaId: string,
  filename: string | null = null,
): Promise<{ media: StoredMedia | null; failure: string | null }> {
  try {
    const info = await fetchWhatsAppMediaInfo(mediaId);
    if (!info) return { media: null, failure: "לא הצלחתי למשוך את הקובץ מוואטסאפ" };
    if (info.fileSize && info.fileSize > 20 * 1024 * 1024) {
      return { media: null, failure: "הקובץ גדול מ-20MB ולא נשמר באתר — אפשר לפתוח אותו באפליקציית וואטסאפ" };
    }
    const bytes = await downloadWhatsAppMedia(info.url, info.fileSize);
    if (!bytes) return { media: null, failure: "הקובץ גדול מדי או שההורדה נכשלה ולא נשמר באתר" };
    const mime = normalizeMime(info.mimeType);
    const ext = mediaExtension(mime, filename);
    const path = `whatsapp/${mediaId}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("items")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw error;
    const { data } = await supabaseAdmin.storage
      .from("items")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (!data?.signedUrl) return { media: null, failure: "הקובץ נקלט אבל לא נוצר לו קישור" };
    const type = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : "document";
    return { media: { url: data.signedUrl, type, filename, mime }, failure: null };
  } catch (e) {
    console.error("[SWEETBABY] whatsapp incoming media download failed", e);
    return { media: null, failure: "שמירת הקובץ באתר נכשלה" };
  }
}

async function handleIncomingMessage(
  supabaseAdmin: any,
  msg: IncomingMessage,
  contactName: string | null,
  businessPhone: string | null,
) {
  let body: string | null = null;
  let media: StoredMedia | null = null;
  let failure: string | null = null;
  // The caption of a photo / video / file only — never a location / contact text or the failure note below.
  let caption: string | null = null;
  const keep = async (id: string, filename: string | null = null) => {
    const r = await storeIncomingMedia(supabaseAdmin, id, filename);
    media = r.media;
    failure = r.failure;
  };

  if (msg.type === "text") {
    body = msg.text?.body ?? null;
  } else if (msg.type === "image" && msg.image) {
    body = msg.image.caption ?? null;
    caption = body;
    await keep(msg.image.id);
  } else if (msg.type === "video" && msg.video) {
    body = msg.video.caption ?? null;
    caption = body;
    await keep(msg.video.id);
  } else if (msg.type === "document" && msg.document) {
    // Any file type. The real file name is kept in its own column, so a caption no longer hides it.
    body = msg.document.caption ?? null;
    caption = body;
    await keep(msg.document.id, msg.document.filename ?? null);
  } else if (msg.type === "audio" && msg.audio) {
    await keep(msg.audio.id);
  } else if (msg.type === "sticker" && msg.sticker) {
    // Stickers arrive as webp images; stored and shown as an image (the table only allows image/video/document/audio).
    await keep(msg.sticker.id);
  } else if (msg.type === "location" && msg.location) {
    const { latitude: lat, longitude: lng, name, address } = msg.location;
    const place = [name, address].filter(Boolean).join(" · ");
    const map = lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : "";
    body = `📍 מיקום${place ? `: ${place}` : ""}${map ? `\n${map}` : ""}`;
  } else if (msg.type === "contacts" && msg.contacts?.length) {
    body = msg.contacts
      .map((c) => `👤 ${c.name?.formatted_name ?? "איש קשר"}${c.phones?.length ? ` — ${c.phones.map((p) => p.phone ?? p.wa_id).filter(Boolean).join(", ")}` : ""}`)
      .join("\n");
  } else if (msg.type === "reaction" && msg.reaction) {
    body = `תגובה: ${msg.reaction.emoji ?? "👍"}`;
  } else {
    // Unknown type — still logged so nothing silently vanishes.
    body = `[הודעה מסוג ${msg.type} — עדיין לא נתמך בתצוגה]`;
  }
  // The file could not be kept: say so in the thread (with the file name) instead of showing an empty bubble.
  if (failure) {
    const named = msg.document?.filename ? ` (${msg.document.filename})` : "";
    body = [body, `⚠️ ${failure}${named}`].filter(Boolean).join("\n");
  }
  const stored = media as StoredMedia | null;

  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    wa_message_id: msg.id,
    direction: "in",
    phone: msg.from,
    contact_name: contactName,
    body,
    media_url: stored?.url ?? null,
    media_type: stored?.type ?? null,
    media_filename: stored?.filename ?? null,
    media_mime: stored?.mime ?? null,
    status: "received",
    business_phone: businessPhone,
  });
  // A unique-constraint hit just means a webhook we already recorded was
  // retried — expected and harmless, not worth logging as an error.
  if (error && !String(error.message ?? "").includes("duplicate key")) {
    console.error("[SWEETBABY] whatsapp incoming message insert failed", error);
  }

  // Anything that is not plain text (voice note, photo, location…): the owner
  // is mailed once per NEW message, because the bot cannot open the content
  // itself. Reactions and stickers are only acknowledgements and stay silent.
  // A duplicate delivery (insert hit the unique key) is never mailed twice.
  if (msg.type !== "text" && !error && shouldAlertOwner(msg.type)) {
    const { notifyWhatsAppNonTextIncoming } = await import("@/lib/whatsapp-alerts.server");
    await notifyWhatsAppNonTextIncoming({
      phone: msg.from,
      contactName,
      type: msg.type,
      caption,
    });
  }

  // Auto-reply bot: text goes to the AI. Everything else is answered by
  // `runWhatsAppNonTextReply` (a caption goes to the AI too, a voice note /
  // photo without a caption / location / contact gets a short fixed reply).
  // A duplicate delivery is skipped (`error` is set when the insert hit the
  // unique key), so one message is never answered twice.
  if (msg.type === "text" && body) {
    await runWhatsAppBotReply(msg.from, contactName, body);
  } else if (msg.type !== "text" && !error) {
    await runWhatsAppNonTextReply(msg.from, contactName, msg.type, caption);
  }
}

// Status precedence: a later state must never be overwritten by an older
// one arriving out of order (sent after delivered, etc.).
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

async function handleStatusUpdate(supabaseAdmin: any, status: StatusUpdate, businessPhone: string | null) {
  const mapped = ["sent", "delivered", "read", "failed"].includes(status.status)
    ? status.status
    : null;
  if (!mapped) return;
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("status, phone, body")
    .eq("wa_message_id", status.id)
    .maybeSingle();
  const errTitle: string | null = status.errors?.[0]?.title ?? null;
  const errCode = status.errors?.[0]?.code ?? null;
  if (!existing) {
    // The outbound row isn't saved yet (callback beat the sender) — leave a
    // marker row so reconciliation can apply the status once it appears.
    await supabaseAdmin.from("whatsapp_messages").insert({
      wa_message_id: status.id,
      direction: "out",
      phone: "unknown",
      body: null,
      status: mapped,
      error: mapped === "failed" ? errTitle : null,
      business_phone: businessPhone,
    });
    if (mapped === "failed") {
      const { notifyWhatsAppSendFailed } = await import("@/lib/whatsapp-alerts.server");
      await notifyWhatsAppSendFailed({ phone: null, body: null, errorTitle: errTitle, errorCode: errCode });
    }
    return;
  }
  if ((STATUS_RANK[existing.status] ?? 0) > STATUS_RANK[mapped]) return;
  const { error } = await supabaseAdmin
    .from("whatsapp_messages")
    .update({ status: mapped, error: errTitle })
    .eq("wa_message_id", status.id);
  if (error) {
    console.error("[SWEETBABY] whatsapp status update failed", error);
    return;
  }
  // Owner alert: only when the message JUST turned failed (a repeated
  // failed callback finds status already failed and stays silent).
  if (mapped === "failed" && existing.status !== "failed") {
    const { notifyWhatsAppSendFailed } = await import("@/lib/whatsapp-alerts.server");
    await notifyWhatsAppSendFailed({
      phone: existing.phone ?? null,
      body: existing.body ?? null,
      errorTitle: errTitle,
      errorCode: errCode,
    });
  }
}

/** Processes one stored delivery's payload. Unknown event types are stored and acknowledged without further work. */
async function processPayload(supabaseAdmin: any, event: string, payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
  // Which of the studio's own WhatsApp numbers this delivery is for —
  // present on every Meta webhook regardless of how many numbers/
  // connections exist, so a second/third connection tags itself correctly
  // with no further code change (see whatsapp-numbers.ts).
  const businessPhone: string | null = value.metadata?.display_phone_number ?? null;
  if (event === "whatsapp.message") {
    const contactName: string | null = value.contacts?.[0]?.profile?.name ?? null;
    for (const msg of value.messages ?? []) {
      await handleIncomingMessage(supabaseAdmin, msg, contactName, businessPhone);
    }
  } else if (event === "whatsapp.status") {
    for (const status of value.statuses ?? []) {
      await handleStatusUpdate(supabaseAdmin, status, businessPhone);
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
