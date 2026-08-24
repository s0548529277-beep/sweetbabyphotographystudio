// Small, dependency-free Twilio helpers: verifying that an incoming webhook
// request genuinely came from Twilio, and building the TwiML XML responses
// that tell Twilio what to say/listen for/do next on a call. No official
// Twilio SDK — same house style as the Google Calendar/Gmail integrations
// (bespoke fetch/crypto-based glue instead of a heavy dependency).

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Validates the `X-Twilio-Signature` header per Twilio's documented
 * algorithm: HMAC-SHA1(full webhook URL + sorted "key"+"value" pairs of the
 * POST body, key = the account's real Auth Token), base64-encoded. Uses Web
 * Crypto (crypto.subtle) so this runs the same on Cloudflare Workers and
 * Node. Protects the voice webhooks from being called by anyone who isn't
 * actually Twilio.
 */
export async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null,
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signatureHeader) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  return computed === signatureHeader;
}

/** Parses a Twilio webhook's application/x-www-form-urlencoded POST body into a plain object. */
export async function parseTwilioForm(request: Request): Promise<Record<string, string>> {
  const formData = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) out[k] = String(v);
  return out;
}

function twimlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

const HE_IL = 'language="he-IL"';

/** Speaks `text` in Hebrew, then listens for the caller's next reply and posts it to `actionUrl`. */
export function twimlSayAndGather(text: string, actionUrl: string): Response {
  return twimlResponse(
    `<Say ${HE_IL}>${xmlEscape(text)}</Say>` +
      `<Gather input="speech" ${HE_IL} speechTimeout="auto" action="${xmlEscape(actionUrl)}" method="POST">` +
      `</Gather>` +
      // No speech heard within Gather's own timeout — try once more before giving up.
      `<Say ${HE_IL}>לא שמעתי, אפשר לנסות שוב?</Say>` +
      `<Gather input="speech" ${HE_IL} speechTimeout="auto" action="${xmlEscape(actionUrl)}" method="POST"></Gather>` +
      `<Say ${HE_IL}>לא הצלחנו להתחבר, ניצור איתך קשר. תודה ולהתראות!</Say>`,
  );
}

/** Speaks `text` in Hebrew and ends the call. */
export function twimlSayAndHangup(text: string): Response {
  return twimlResponse(`<Say ${HE_IL}>${xmlEscape(text)}</Say><Hangup/>`);
}

/** Speaks `text` in Hebrew, then transfers the call to a real phone number. */
export function twimlSayAndDial(text: string, phoneNumber: string): Response {
  return twimlResponse(`<Say ${HE_IL}>${xmlEscape(text)}</Say><Dial>${xmlEscape(phoneNumber)}</Dial>`);
}
