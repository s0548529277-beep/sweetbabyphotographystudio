// WhatsApp Business client routed through the Lovable connector gateway
// (the "SWEETBABY's WhatsApp Business" connection linked to this project).
// The gateway injects Meta's access token and phone-number id, so paths
// carry no account identifiers and no Graph version: `/messages` sends,
// `/media/<id>` reads media metadata, `/media_download` fetches the bytes.
// Credentials live only in the two headers below — never in URLs.
//
//   WHATSAPP_API_KEY  — per-connection key, injected by the connector link
//   LOVABLE_API_KEY   — project key, already present

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

function gatewayHeaders(): Record<string, string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connectionKey = process.env.WHATSAPP_API_KEY;
  if (!lovableKey || !connectionKey) {
    throw new Error("WhatsApp is not connected yet — missing gateway credentials.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

async function postToMessagesEndpoint(
  body: Record<string, unknown>,
): Promise<{ wamid: string | null }> {
  const res = await fetch(`${GATEWAY_URL}/messages`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[SWEETBABY] whatsapp send failed [${res.status}]: ${text}`);
    throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text);
  return { wamid: json?.messages?.[0]?.id ?? null };
}

/** Sends a plain text message. `to` is digits-only, country code included, no "+" (e.g. "972501234567"). */
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<{ wamid: string | null }> {
  return postToMessagesEndpoint({ to, type: "text", text: { body } });
}

/**
 * Sends an approved message TEMPLATE — the only way to message a number
 * that hasn't written in within the last 24h (WhatsApp/Meta's own policy;
 * a plain sendWhatsAppText to such a number is rejected). `languageCode`
 * and the order/count of `bodyParams` must match exactly what was
 * registered in Meta's WhatsApp Manager for this template name — see
 * whatsapp-templates.ts. Meta renders the actual approved wording from the
 * template name + these parameters; this call never sends free-form text.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[],
): Promise<{ wamid: string | null }> {
  return postToMessagesEndpoint({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams.length
        ? { components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  });
}

export type WhatsAppMediaType = "image" | "video" | "document";

/**
 * Sends a media message by public URL (the "link" method) — the admin UI
 * uploads the file to Supabase Storage first (same "items" bucket the photo
 * galleries already use) and passes its URL here, which avoids needing
 * Meta's separate binary-upload endpoint entirely.
 */
export async function sendWhatsAppMedia(
  to: string,
  type: WhatsAppMediaType,
  link: string,
  caption?: string,
): Promise<{ wamid: string | null }> {
  return postToMessagesEndpoint({
    to,
    type,
    [type]: caption ? { link, caption } : { link },
  });
}

/**
 * Resolves a Meta media id (from an incoming message) to a short-lived
 * download URL + mime type, through the gateway. The URL expires after ~5
 * minutes and still needs authorization to fetch — see downloadWhatsAppMedia.
 */
export async function fetchWhatsAppMediaInfo(
  mediaId: string,
): Promise<{ url: string; mimeType: string; fileSize: number | null } | null> {
  const res = await fetch(`${GATEWAY_URL}/media/${mediaId}`, {
    headers: gatewayHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json?.url) return null;
  return {
    url: json.url,
    mimeType: json.mime_type ?? "application/octet-stream",
    fileSize: typeof json.file_size === "number" ? json.file_size : null,
  };
}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

/**
 * Downloads the actual media bytes through the gateway's media_download
 * endpoint (the Meta URL goes in a header, never the query string). Reads
 * the body as a stream with a hard byte cap instead of arrayBuffer(), so an
 * untrusted oversized response can't buffer unbounded into memory.
 */
export async function downloadWhatsAppMedia(
  url: string,
  declaredSize?: number | null,
): Promise<ArrayBuffer | null> {
  if (declaredSize && declaredSize > MAX_MEDIA_BYTES) return null;
  const res = await fetch(`${GATEWAY_URL}/media_download`, {
    headers: { ...gatewayHeaders(), "X-WhatsApp-Media-URL": url },
  });
  if (!res.ok || !res.body) return null;

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MEDIA_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

export const WHATSAPP_MEDIA_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};
