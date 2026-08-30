// Small, dependency-free ימות המשיח (Yemot Hamashiach) helpers — same house
// style as twilio.server.ts: no SDK, just the bespoke plain-text protocol
// their IVR2 "שלוחת API" extension speaks. Confirmed against the open-source
// yemot-router2 library's source (github.com/ShlomoCode/yemot-router2) since
// Yemot doesn't publish a public REST reference. The "voice" read mode below
// is confirmed working against a real live call; two other directives were
// tried and did NOT work reliably live, and were removed rather than kept
// around half-working: a "tap" (keypad digit) read mode for a numbered menu
// ("לא הקשת כמות מספרים נכונה" — replaced by the speech-keyword menu in
// voice-menu.server.ts), and routing_yemot for live-transferring to a human
// ("השלוחה אליה ביקשתם לעבור אינה פעילה עקב חוסר בהגדרות" — it needs a real
// extension configured on Yemot's own side, not just a raw phone number; the
// Yemot line now always offers to leave a message instead — see
// api.yemot.ivr.ts). So this file only ever asks for voice, never transfers.
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

// Yemot's own built-in typing_playback_mode presets that ALSO fix the
// required digit count (min_digits === max_digits) — used instead of a
// hand-picked count specifically because a PREVIOUS keypad attempt on this
// exact line failed live with "לא הקשת כמות מספרים נכונה" (wrong digit
// count), which is exactly the failure mode a min/max mismatch produces.
// "Date" = DDMMYYYY (8 digits), "Time" = HHMM in 24h format (4 digits) —
// both confirmed against yemot-router2's own source (an open-source
// wrapper around this same raw protocol; Yemot has no public reference),
// specifically its makeTapModeRead in response-functions.js, which cites
// Yemot's own docs (f2.freeivr.co.il/post/77520) for these exact pairs.
const TAP_MODE_DIGITS: Record<string, { min: number; max: number }> = {
  Date: { min: 8, max: 8 },
  Time: { min: 4, max: 4 },
};

export type YemotTapOptions = {
  /** Yemot's built-in playback/validation presets — "Date"/"Time" also fix the digit count (see TAP_MODE_DIGITS); "Digits" just reads the typed digits back for confirmation with no forced count. */
  mode?: "Date" | "Time" | "Digits";
  /** Only the digits in this list may be typed (e.g. [1,2,3,4,5,6] for a 1-6 duration choice) — Yemot itself rejects anything else instead of this app finding out after the fact. */
  digitsAllowed?: number[];
  /** Overrides the preset (or sets it directly with no mode) — omit to use the preset's own count. */
  minDigits?: number;
  maxDigits?: number;
  secWait?: number;
};

/**
 * Speaks `text` then listens for KEYPAD digits (not speech) — the DTMF
 * input option for the no-AI booking flow (voice-noai-booking.server.ts).
 * Raw directive format confirmed against yemot-router2's own source
 * (response-functions.js, makeTapModeRead) rather than guessed at, since
 * Yemot itself has no public API reference:
 *   read=<msg>=<valName>,<re_enter>,<max_digits>,<min_digits>,<sec_wait>,
 *        <typing_playback_mode>,<block_asterisk>,<block_zero>,
 *        <replace_char>,<digits_allowed joined by '.'>,<amount_attempts>,
 *        <allow_empty>,<empty_val>,<block_change_keyboard>
 * The typed value comes back on the NEXT hit as `digits`, not `speech` —
 * callers must read `params.digits` while in a stage that used this.
 */
export function yemotSayAndListenTap(text: string, opts: YemotTapOptions = {}): Response {
  const preset = opts.mode ? TAP_MODE_DIGITS[opts.mode] : undefined;
  const minDigits = opts.minDigits ?? preset?.min ?? 1;
  const maxDigits = opts.maxDigits ?? preset?.max ?? "";
  const tapOps = [
    "digits", // valName — read back on the next hit as params.digits
    "no", // re_enter_if_exists: always want a fresh answer, same as the speech read above
    maxDigits,
    minDigits,
    opts.secWait ?? 9,
    opts.mode ?? "No",
    "no", // block_asterisk_key
    "no", // block_zero_key
    "", // replace_char
    opts.digitsAllowed ? opts.digitsAllowed.join(".") : "",
    "", // amount_attempts
    "", // allow_empty
    "", // empty_val
    "", // block_change_keyboard
  ];
  return yemotResponse(`read=${textSegment(text)}=${tapOps.join(",")}`);
}

/** Acknowledges Yemot's own end-of-call notification (hangup=yes) — no directive needed, just a 200. */
export function yemotAck(): Response {
  return yemotResponse("");
}
