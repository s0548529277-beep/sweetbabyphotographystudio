// Bespoke fetch/crypto-based client for the official WhatsApp Business
// Platform (Meta Cloud API) — same house style as twilio.server.ts and the
// Google Calendar integration: no heavy SDK, just direct Graph API calls.
// Requires three env vars once the studio owner has a Meta Business /
// WhatsApp Business Platform account set up (see /admin/whatsapp for the
// exact setup steps shown there):
//   WHATSAPP_ACCESS_TOKEN   — the permanent (System User) access token
//   WHATSAPP_PHONE_NUMBER_ID — Meta's internal id for the sending number (NOT the phone number itself)
//   WHATSAPP_APP_SECRET     — used to verify incoming webhook signatures
//   WHATSAPP_VERIFY_TOKEN   — any string she picks herself, used only for the one-time webhook handshake

const GRAPH_VERSION = "v21.0";

function apiUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

function accessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("Missing WHATSAPP_ACCESS_TOKEN — WhatsApp is not connected yet.");
  return token;
}

function phoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID — WhatsApp is not connected yet.");
  return id;
}

async function postToMessagesEndpoint(
  body: Record<string, unknown>,
): Promise<{ wamid: string | null }> {
  const res = await fetch(apiUrl(`${phoneNumberId()}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = json?.error?.message || res.statusText;
    throw new Error(`WhatsApp send failed: ${reason}`);
  }
  return { wamid: json?.messages?.[0]?.id ?? null };
}

/** Sends a plain text message. `to` is digits-only, country code included, no "+" (e.g. "972501234567"). */
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<{ wamid: string | null }> {
  return postToMessagesEndpoint({ to, type: "text", text: { body } });
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
 * download URL + mime type. The URL itself still needs the same Bearer
 * token to actually fetch — see downloadWhatsAppMedia.
 */
export async function fetchWhatsAppMediaInfo(
  mediaId: string,
): Promise<{ url: string; mimeType: string } | null> {
  const res = await fetch(apiUrl(mediaId), {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json?.url) return null;
  return { url: json.url, mimeType: json.mime_type ?? "application/octet-stream" };
}

/** Downloads the actual media bytes from a URL returned by fetchWhatsAppMediaInfo. */
export async function downloadWhatsAppMedia(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken()}` } });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends on every webhook
 * POST, per their documented algorithm: HMAC-SHA256 over the exact raw
 * request body, keyed with the app secret, hex-encoded, prefixed
 * "sha256=". MUST run against the raw body text (before JSON.parse) — Web
 * Crypto (crypto.subtle) so this runs the same on Cloudflare Workers and
 * Node, same approach as verifyTwilioSignature in twilio.server.ts.
 */
export async function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;
  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signatureHeader.slice(expectedPrefix.length);
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
