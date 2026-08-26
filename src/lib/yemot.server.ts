// Small, dependency-free ימות המשיח (Yemot Hamashiach) helpers — same house
// style as twilio.server.ts: no SDK, just the bespoke plain-text protocol
// their IVR2 "שלוחת API" extension speaks. Confirmed against the open-source
// yemot-router2 library's source (github.com/ShlomoCode/yemot-router2) since
// Yemot doesn't publish a public REST reference; this hasn't been verified
// against a live call yet — the very first real call is the real test.
//
// Protocol shape: Yemot POSTs (or GETs) call info as form fields —
// ApiCallId (a stable id for the whole call, our session key), ApiPhone
// (caller's number), and hangup=yes once the caller disconnects. Our
// response is a single plain-text line built from `key=value` directives:
//   id_list_message=t-<text>          → speak text, then re-hit our URL
//   read=t-<text>=<valName>,...       → speak text, then listen for speech
//                                        and re-hit our URL with that
//                                        transcript under `valName`
//   go_to_folder=hangup               → end the call
// Multiple directives in one response are joined with `&`, matching every
// other directive pair Yemot documents (ApiCallId etc.) being query-string
// shaped.

/** Parses an incoming Yemot webhook request (GET query string or POST form body) into a plain object. */
export async function parseYemotParams(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const url = new URL(request.url);
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      for (const [k, v] of formData.entries()) out[k] = String(v);
    } catch {
      // Some Yemot configs send POST with no body (everything in the query
      // string) — formData() throws on an empty/non-form body, ignore it.
    }
  }
  return out;
}

// Characters the Yemot protocol itself uses as delimiters, so any text we
// embed inside a directive (a message the caller hears) has to have them
// stripped first — same set the yemot-router2 library sanitizes, and for
// the same reason: a stray "." would be read as a new message segment, a
// stray "=" or "&" would be read as a new directive.
const YEMOT_UNSAFE_CHARS = /[.\-"'&|=]/g;

function sanitize(text: string): string {
  return text.replace(YEMOT_UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
}

/** One `t-<text>` message segment for id_list_message/read, sanitized for the protocol's delimiter characters. */
function textSegment(text: string): string {
  return `t-${sanitize(text)}`;
}

function yemotResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Speaks `text` in Hebrew (Yemot's own built-in TTS — no audio file to
 * generate), then listens for the caller's next spoken reply and re-hits
 * this same extension's URL with the transcript under the `speech` field.
 */
export function yemotSayAndListen(text: string): Response {
  // read=<prompt>=<valName>,<re_enter:no>,voice,<lang>
  // re_enter=no: don't re-ask the same question if `speech` was already
  // filled on a prior hit of this call — we always want a *new* answer.
  return yemotResponse(`read=${textSegment(text)}=speech,no,voice,he`);
}

/** Speaks `text` in Hebrew and ends the call. */
export function yemotSayAndHangup(text: string): Response {
  return yemotResponse(`id_list_message=${textSegment(text)}&go_to_folder=hangup`);
}

/** Speaks `text` in Hebrew, then transfers the call to a real phone number. */
export function yemotSayAndTransfer(text: string, phoneNumber: string): Response {
  return yemotResponse(`id_list_message=${textSegment(text)}&routing_yemot=${sanitize(phoneNumber)}`);
}

/** Acknowledges Yemot's own end-of-call notification (hangup=yes) — no directive needed, just a 200. */
export function yemotAck(): Response {
  return yemotResponse("");
}
