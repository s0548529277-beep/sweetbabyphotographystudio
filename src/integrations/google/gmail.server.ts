// Server-only: sends mail from the studio's own Gmail account
// (s0548529277@gmail.com) through the linked Lovable connector gateway.
// The gateway refreshes the Google OAuth token automatically, so no
// refresh-token maintenance is needed here.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word so Hebrew subjects render correctly.
  const b64 = toBase64Url(new TextEncoder().encode(value))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return `=?UTF-8?B?${padded}?=`;
}

function chunk76(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

/** An attachment to include on an outgoing email. base64Data is raw base64 (no data: prefix). */
export type GmailAttachment = {
  filename: string;
  contentType: string;
  base64Data: string;
};

export type GmailMessage = {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  attachments?: GmailAttachment[];
};

function buildMime({ to, subject, html, fromName = "Sweetbaby", attachments = [] }: GmailMessage): string {
  const htmlB64 = chunk76(toBase64Url(new TextEncoder().encode(html)).replace(/-/g, "+").replace(/_/g, "/"));
  const htmlB64Padded = htmlB64 + "=".repeat((4 - (htmlB64.replace(/\r\n/g, "").length % 4)) % 4);

  const headers = [
    `From: ${encodeHeader(fromName)} <s0548529277@gmail.com>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];

  if (attachments.length === 0) {
    return [
      ...headers,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      htmlB64Padded,
    ].join("\r\n");
  }

  // multipart/mixed: one text/html part + one part per attachment.
  const boundary = `sweetbaby_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64Padded,
    "",
  ];

  for (const att of attachments) {
    const padded = att.base64Data + "=".repeat((4 - (att.base64Data.length % 4)) % 4);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      chunk76(padded),
      "",
    );
  }
  parts.push(`--${boundary}--`);

  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

/**
 * Sends one HTML email (optionally with file attachments) via the studio's
 * Gmail account. Returns true on success; logs and returns false on failure
 * (never throws, so a mail problem can't break an order/booking).
 */
export async function sendGmail(message: GmailMessage): Promise<boolean> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !connKey) {
    console.error("[SWEETBABY] gmail skipped — missing LOVABLE_API_KEY/GOOGLE_MAIL_API_KEY");
    return false;
  }

  const mime = buildMime(message);
  const raw = toBase64Url(new TextEncoder().encode(mime));

  try {
    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      console.error("[SWEETBABY] gmail send error", message.to, res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[SWEETBABY] gmail send failed", message.to, e);
    return false;
  }
}

function requiredGmailKeys(): { lovableKey: string; connKey: string } | null {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !connKey) return null;
  return { lovableKey, connKey };
}

function gmailAuthHeaders(keys: { lovableKey: string; connKey: string }): Record<string, string> {
  return { Authorization: `Bearer ${keys.lovableKey}`, "X-Connection-Api-Key": keys.connKey };
}

function decodeGmailBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

function gmailHeaderValue(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Walks a Gmail message payload for the best plain-text body it can find — text/plain preferred, text/html (tags stripped) as a fallback. Recurses into multipart/* parts. */
function extractGmailPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeGmailBase64Url(payload.body.data);
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeGmailBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      const nested = extractGmailPlainText(part);
      if (nested) return nested;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeGmailBase64Url(payload.body.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

export type GmailSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

/**
 * Searches the studio's connected Gmail inbox through the same connector
 * gateway sendGmail already uses (Gmail's real REST API, proxied — search
 * syntax is Gmail's own: "from:x", "is:unread", "subject:...", free text,
 * etc). Returns short summaries only (no full body — call
 * getGmailMessageBody for one message's full text once you know its id).
 * Never throws: logs and returns [] on any failure, same as sendGmail's
 * best-effort contract, since this always runs inside an AI tool call or
 * an admin-only page that already has its own error handling.
 */
export async function searchGmail(query: string, maxResults = 10): Promise<GmailSummary[]> {
  const keys = requiredGmailKeys();
  if (!keys) {
    console.error("[SWEETBABY] gmail search skipped — missing LOVABLE_API_KEY/GOOGLE_MAIL_API_KEY");
    return [];
  }
  try {
    const listUrl = new URL(`${GATEWAY_URL}/users/me/messages`);
    listUrl.searchParams.set("q", query);
    listUrl.searchParams.set("maxResults", String(Math.min(Math.max(maxResults, 1), 25)));
    const listRes = await fetch(listUrl.toString(), { headers: gmailAuthHeaders(keys) });
    if (!listRes.ok) {
      console.error("[SWEETBABY] gmail search list error", listRes.status, await listRes.text());
      return [];
    }
    const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
    const ids = (listJson.messages ?? []).map((m) => m.id);
    if (ids.length === 0) return [];

    const summaries = await Promise.all(
      ids.map(async (id) => {
        const mUrl = `${GATEWAY_URL}/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
        const mRes = await fetch(mUrl, { headers: gmailAuthHeaders(keys) });
        if (!mRes.ok) return null;
        const m = await mRes.json();
        return {
          id: m.id,
          threadId: m.threadId,
          subject: gmailHeaderValue(m.payload?.headers, "Subject") || "(ללא נושא)",
          from: gmailHeaderValue(m.payload?.headers, "From"),
          date: gmailHeaderValue(m.payload?.headers, "Date"),
          snippet: m.snippet ?? "",
        } as GmailSummary;
      }),
    );
    return summaries.filter((s): s is GmailSummary => s !== null);
  } catch (e) {
    console.error("[SWEETBABY] gmail search failed", query, e);
    return [];
  }
}

/** Full plain-text body of one email, by id (from searchGmail's results). Returns null on failure or a not-found id. */
export async function getGmailMessageBody(id: string): Promise<string | null> {
  const keys = requiredGmailKeys();
  if (!keys) {
    console.error("[SWEETBABY] gmail read skipped — missing LOVABLE_API_KEY/GOOGLE_MAIL_API_KEY");
    return null;
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/users/me/messages/${id}?format=full`, { headers: gmailAuthHeaders(keys) });
    if (!res.ok) {
      console.error("[SWEETBABY] gmail read error", id, res.status, await res.text());
      return null;
    }
    const m = await res.json();
    const text = extractGmailPlainText(m.payload);
    return text || m.snippet || null;
  } catch (e) {
    console.error("[SWEETBABY] gmail read failed", id, e);
    return null;
  }
}

/** Sends the same message (optionally with attachments) to the studio inbox plus (optionally) the customer — deduped case-insensitively so a test order using the studio's own address (in any casing) never sends the same email twice to one inbox. */
export async function sendStudioAndCustomer(opts: {
  customerEmail?: string | null;
  subject: string;
  html: string;
  attachments?: GmailAttachment[];
}): Promise<void> {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of ["s0548529277@gmail.com", opts.customerEmail]) {
    if (!raw) continue;
    const normalized = raw.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(raw.trim());
  }
  for (const to of recipients) {
    await sendGmail({ to, subject: opts.subject, html: opts.html, attachments: opts.attachments });
  }
}
