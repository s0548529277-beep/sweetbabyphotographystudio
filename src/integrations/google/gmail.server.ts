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

function requiredGmailKeys(connKeyOverride?: string): { lovableKey: string; connKey: string } | null {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = connKeyOverride || process.env.GOOGLE_MAIL_API_KEY;
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

export type GmailSearchResult = {
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export type GmailSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

/**
 * Searches the studio's Gmail inbox for correspondence with one specific
 * email address (matches "from:" or "to:" that address only) and returns
 * lightweight metadata — sender, subject, date, snippet — never the full
 * message body. The query is always built server-side from a single email
 * address, never from free text, specifically so a caller can't use this to
 * fish for other people's correspondence (e.g. by name, phone number, or
 * keyword) — see search_email in voice-chat.server.ts, its only caller.
 * For an admin-trusted, free-text search see searchGmail below instead.
 */
export async function searchGmailByEmail(email: string, maxResults = 5): Promise<GmailSearchResult[]> {
  const keys = requiredGmailKeys();
  if (!keys) {
    console.error("[SWEETBABY] gmail search skipped — missing LOVABLE_API_KEY/GOOGLE_MAIL_API_KEY");
    return [];
  }
  const headers = gmailAuthHeaders(keys);

  const q = `(from:${email} OR to:${email})`;
  const listRes = await fetch(
    `${GATEWAY_URL}/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`,
    { headers },
  );
  if (!listRes.ok) {
    console.error("[SWEETBABY] gmail search list error", listRes.status, await listRes.text().catch(() => ""));
    return [];
  }
  const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (listData.messages ?? []).map((m) => m.id);

  const results: GmailSearchResult[] = [];
  for (const id of ids) {
    const msgRes = await fetch(
      `${GATEWAY_URL}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers },
    );
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as {
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const header = (name: string) => msg.payload?.headers?.find((h) => h.name === name)?.value ?? "";
    results.push({
      from: header("From"),
      subject: header("Subject"),
      date: header("Date"),
      snippet: msg.snippet ?? "",
    });
  }
  return results;
}

/**
 * Searches the studio's connected Gmail inbox through the same connector
 * gateway sendGmail already uses (Gmail's real REST API, proxied — search
 * syntax is Gmail's own: "from:x", "is:unread", "subject:...", free text,
 * etc). Returns short summaries only (no full body — call
 * getGmailMessageBody for one message's full text once you know its id).
 * Never throws: logs and returns [] on any failure, same as sendGmail's
 * best-effort contract, since this always runs inside an AI tool call or
 * an admin-only page that already has its own error handling. Free-text
 * query — only for trusted (admin) callers, unlike searchGmailByEmail.
 */
export async function searchGmail(query: string, maxResults = 10, connKey?: string): Promise<GmailSummary[]> {
  const keys = requiredGmailKeys(connKey);
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
export async function getGmailMessageBody(id: string, connKey?: string): Promise<string | null> {
  const keys = requiredGmailKeys(connKey);
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

/**
 * Every Gmail account linked to this project through the Lovable connector.
 * The studio account is GOOGLE_MAIL_API_KEY; a second linked Gmail (e.g. the
 * owner's personal m0548529277) gets its own GOOGLE_MAIL_API_KEY_* secret —
 * we don't hard-code that name, we scan for any env var starting with
 * GOOGLE_MAIL_API_KEY and ask Gmail which address each one belongs to.
 * Cached per server instance. Added 2026-10-27 for the admin site bot.
 */
let gmailAccountsCache: { at: number; list: Array<{ email: string; connKey: string }> } | null = null;

export async function listGmailAccounts(): Promise<Array<{ email: string; connKey: string }>> {
  if (gmailAccountsCache && Date.now() - gmailAccountsCache.at < 10 * 60_000) return gmailAccountsCache.list;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return [];
  const keys = Object.entries(process.env)
    .filter(([k, v]) => k.startsWith("GOOGLE_MAIL_API_KEY") && !!v)
    .map(([, v]) => v as string);
  const list: Array<{ email: string; connKey: string }> = [];
  for (const connKey of [...new Set(keys)]) {
    try {
      const res = await fetch(`${GATEWAY_URL}/users/me/profile`, {
        headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey },
      });
      if (!res.ok) continue;
      const p = (await res.json()) as { emailAddress?: string };
      if (p.emailAddress) list.push({ email: p.emailAddress.toLowerCase(), connKey });
    } catch (e) {
      console.error("[SWEETBABY] gmail profile lookup failed", e);
    }
  }
  gmailAccountsCache = { at: Date.now(), list };
  return list;
}

/** Picks a linked account by (partial) address; defaults to the studio account. */
export async function resolveGmailAccount(account?: string): Promise<{ email: string; connKey: string } | null> {
  const list = await listGmailAccounts();
  if (!list.length) return null;
  const want = (account ?? "").trim().toLowerCase();
  if (want) {
    const hit = list.find((a) => a.email === want || a.email.startsWith(want.split("@")[0]));
    if (hit) return hit;
    return null;
  }
  return list.find((a) => a.email === "s0548529277@gmail.com") ?? list[0];
}

/**
 * Creates a Gmail DRAFT (never sends). Plain-text body. When threadId is
 * given the draft is attached to that conversation as a reply.
 */
export async function createGmailDraft(opts: {
  connKey: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  threadId?: string;
}): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  const keys = requiredGmailKeys(opts.connKey);
  if (!keys) return { ok: false, error: "חיבור הג׳ימייל לא מוגדר" };
  const html = `<div dir="rtl" style="font-family:sans-serif;white-space:pre-wrap">${opts.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</div>`;
  const bodyB64 = chunk76(Buffer.from(html, "utf-8").toString("base64"));
  const mime = [
    `From: ${opts.fromEmail}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyB64,
  ].join("\r\n");
  const raw = toBase64Url(new TextEncoder().encode(mime));
  try {
    const res = await fetch(`${GATEWAY_URL}/users/me/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...gmailAuthHeaders(keys) },
      body: JSON.stringify({ message: opts.threadId ? { raw, threadId: opts.threadId } : { raw } }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[SWEETBABY] gmail draft error", res.status, t);
      return { ok: false, error: `Gmail ${res.status}` };
    }
    const j = (await res.json()) as { id?: string };
    return { ok: true, draftId: j.id ?? "" };
  } catch (e) {
    console.error("[SWEETBABY] gmail draft failed", e);
    return { ok: false, error: "שגיאת רשת" };
  }
}
