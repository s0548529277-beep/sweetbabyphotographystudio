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

export type GmailMessage = {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
};

/**
 * Sends one HTML email via the studio's Gmail account.
 * Returns true on success; logs and returns false on failure (never throws,
 * so a mail problem can't break an order/booking).
 */
export async function sendGmail({ to, subject, html, fromName = "Sweetbaby" }: GmailMessage): Promise<boolean> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !connKey) {
    console.error("[SWEETBABY] gmail skipped — missing LOVABLE_API_KEY/GOOGLE_MAIL_API_KEY");
    return false;
  }

  const mime = [
    `From: ${encodeHeader(fromName)} <s0548529277@gmail.com>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    // base64 body keeps UTF-8 intact across the wire
    (() => {
      const b64 = toBase64Url(new TextEncoder().encode(html)).replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      return padded.replace(/(.{76})/g, "$1\r\n");
    })(),
  ].join("\r\n");

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
      console.error("[SWEETBABY] gmail send error", to, res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[SWEETBABY] gmail send failed", to, e);
    return false;
  }
}

/** Sends the same message to the studio inbox plus (optionally) the customer. */
export async function sendStudioAndCustomer(opts: {
  customerEmail?: string | null;
  subject: string;
  html: string;
}): Promise<void> {
  const recipients = ["s0548529277@gmail.com"];
  if (opts.customerEmail && !recipients.includes(opts.customerEmail)) recipients.push(opts.customerEmail);
  for (const to of recipients) {
    await sendGmail({ to, subject: opts.subject, html: opts.html });
  }
}
