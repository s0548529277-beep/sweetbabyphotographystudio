<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Phone voice bot — TWO separate channels, TWO separate voices

**Update 2026-09-02, superseding the note below from 2026-08-25**: that
earlier note said there was no ימות המשיח (Yemot Hamashiach) integration in
this repo. That was true *at the time* (confirmed by an exhaustive search)
but is no longer — a full Yemot integration landed shortly after
(`src/lib/yemot.server.ts`, `src/routes/api.yemot.ivr.ts`,
`src/lib/voice-phrases.server.ts`, `src/lib/voice-menu.server.ts`, and more).
The lesson, not just the correction: **re-check before asserting a repo
doesn't have something, especially if real-world behavior (a user's actual
live phone line) contradicts what a code search found** — the code may
simply not have existed yet.

The phone AI assistant ("נועה") answers on **two independent channels that
share the same conversation logic and phrase text but are otherwise
unrelated integrations**:

- **Twilio** (`src/lib/twilio.server.ts`, `src/routes/api.voice.incoming.ts`,
  `src/routes/api.voice.respond.ts`) — TwiML webhooks. Its TTS voice IS
  controllable from this codebase: `/admin/voice-bot` writes `app_settings`
  (key `"voice_bot_voice"`, values `"default" | "female" | "male"`), and
  `src/lib/voice-settings.server.ts` resolves that into a `voice="Google.he-
  IL-Wavenet-C/-D"` attribute on `<Say>` (Twilio proxies non-English TTS
  through Google Cloud voices this way — there's no direct Google Cloud TTS
  API call anywhere in this repo). See `voice-bot-options.ts` for the exact
  IDs.
- **ימות המשיח (Yemot Hamashiach)** (`src/lib/yemot.server.ts`,
  `src/routes/api.yemot.ivr.ts`) — a bespoke plain-text IVR2 protocol (see
  that file's own doc comment for the directive shapes). Yemot's own
  built-in TTS engine reads the text — **its voice's actual sound (male/
  female) is a setting on Yemot's own side (their ניהול panel/file
  manager), not something any code here can control.** `/admin/voice-bot-
  text` only controls the bot's *grammatical* self-reference gender
  (`bot_voice_gender` in `voice-phrases.server.ts`) — a wording choice, not
  the acoustic voice — precisely because the acoustic voice isn't ours to
  set. If the actual live phone line's voice sound needs to change, that's
  done in Yemot's admin, not here.

Both channels pull their spoken phrases from the same source
(`voice-phrases.server.ts`'s `DEFAULT_PHRASES` / `voice_bot_phrases` table,
admin-edited at `/admin/voice-bot-text`) and both run conversation turns
through `src/lib/voice-chat.server.ts`'s `runVoiceTurn` — so a change to
either of those affects both channels. If a user says a phone bot behaves a
particular way, check *which channel their real number actually points to*
before assuming; don't assume it's Twilio just because that's the channel
with more code in this repo, or Yemot just because "ימות המשיח" was
mentioned — both are real and live.

`voice-bot-options.ts` (plain constants, no `.server` suffix) is
deliberately separate from `voice-settings.server.ts` (touches
`supabaseAdmin`) so the Twilio admin picker page can import the constants
without pulling server-only code into the client bundle — this project's
`*.server.ts` files are a hard client/server boundary; importing one from a
client-rendered route component breaks the build.

### Yemot's own `ext.ini`/`ivr.ini` settings (2026-09-02) — not this repo's code

These live entirely on Yemot's side (edited in their ניהול panel → הגדרות
מתקדמות → עריכת קבצי INI, on the same API-type extension whose `api_link`
points at `/api/yemot/ivr`) — nothing in this repo sets or reads them, but
they're recorded here since they came out of the same investigation as the
code changes below, and a future session (or the studio owner) may ask
about them again. Sourced from a GitHub-hosted snapshot of Yemot's own
support forum (`NHLOCAL/tools` repo, `skills/yemot-telephony/references/
snapshot/*.md` — the live forum at f2.freeivr.co.il is not reachable from
this environment), not guessed:
- `tts_voice=<name>` — the acoustic TTS voice. Confirmed values: female —
  `Sivan`, `Osnat`, `ymFemale`; male — `ymMale` (system default, aka
  "Gilad"), `Elik_2100`, `Jacob`. Some modules need the key to be `voice`
  instead — check if `tts_voice` doesn't seem to take effect.
- `tts_rate=<n>` — reading speed, integer **-10 to 10 only** (10 = fastest,
  0 = default). 10 is the actual ceiling — there's no faster setting past
  it. Some modules need the key to be `rate` instead; safe to set both
  lines together since Yemot ignores whichever key doesn't apply.
- `api_say_tts=no` — disables Yemot's own default behavior of reading back
  ("שיקוף") whatever it just transcribed from the caller's speech before
  continuing. This is what actually fixed a report of "the bot repeats
  every message I say back to me" — it's a Yemot-platform default, not
  anything this app's code was doing. (`api_voice_ask_ok=yes` is a
  *different*, opt-in "please confirm what I heard" prompt — leave it
  unset/`no`, it would make the repeating worse, not better.)

### `THINKING_FILLER_KEY` — hiding AI "thinking" latency on the Yemot line

Added 2026-09-02, in code this time (`voice-phrases.server.ts`,
`yemot.server.ts`'s `yemotSayThenResume`, `api.yemot.ivr.ts`'s
`ai_pending` stage) — see `THINKING_FILLER_KEY`'s own doc comment in
`voice-phrases.server.ts` for the full mechanism. Short version: Yemot's
protocol is fully synchronous, so an AI turn that takes several seconds
(up to 30s, up to 6 tool-call rounds — see `runVoiceTurn`'s own comment for
why that budget isn't safe to shrink) means the caller hears total silence
the whole time. This setting makes the bot say `phrases.thinking_filler`
("רגע אחד...") immediately, then does the real (slow) work on the follow-up
hit. **It does not make the AI faster, only fills the dead air.**

**Redesigned same day, later:** the first version used a bare
`id_list_message` (no `read`/listen step) banking on an unconfirmed
assumption — sourced from `yemot-router2`'s docs, never actually exercised
live — that Yemot auto-continues to the next hit on its own after a bare
`id_list_message` instead of just stopping. It shipped OFF by default and
was never tested. `yemotSayThenResume` now reuses the ordinary `read`
(speech-listen) directive instead — the exact same mechanism every other
turn in this app already relies on successfully, every call — so there is
no new, unconfirmed protocol behavior being bet on. **Defaults ON** as of
this redesign (an explicit "off" row at `/admin/voice-bot-text` still wins)
— still worth one real test call after deploying, same as any phone-bot
change, but no longer gated behind a manual, unverified opt-in.

An optional short hold-tone/music segment (`THINKING_FILLER_MUSIC_KEY`, also
admin-editable) can play for a couple of seconds right before the spoken
filler — syntax is `h-<musicName>[,<maxSec>]` per `makeMessagesData` in
`yemot-router2`'s own source (`github.com/ShlomoCode/yemot-router2`,
`lib/response-functions.js`; the full directive-name mapping there:
`file:f, text:t, speech:s, digits:d, number:n, alpha:a, zmanim:z,
go_to_folder:g, system_message:m, music_on_hold:h, date:date, dateH:dateH`,
segments joined by `.`). `musicName` has to already exist as an uploaded
file in **this specific Yemot account's own** file/music library (their
ניהול panel) — nothing in this codebase can discover or default that id
sensibly, so it's left blank (no tone, words only) until an admin finds a
real id there and enters it.

### Speed — what's actually controllable from here vs. Yemot's own side

A direct report ("תשפר מהירות") is mostly about *perceived* speed on the
Yemot line specifically — the thinking-filler above is the main lever this
codebase has (fills dead air; doesn't shorten the real wait). Two more
levers exist but live entirely in Yemot's own `ext.ini`/`ivr.ini` (see
below, un-verified whether they're actually SET on the live account — worth
checking if speed is still a live complaint after the filler ships):
`tts_rate=10` (already the documented ceiling, no faster setting exists)
and `api_say_tts=no` (stops Yemot's own speech-recognition readback, which
otherwise doubles perceived latency by repeating what she just said before
continuing). A tighter AI tool-call/timeout budget was tried before and
made real calls fail *more* often (see `runVoiceTurn`'s own comment) — don't
re-try shrinking that without new evidence it's actually safe now.

### Booking intent overrides menu mode, always (2026-09-02)

`api.yemot.ivr.ts`'s stage-"menu" handling checks `wantsToBookNow(speech)`
(a narrow, explicit word list — "לשריין", "רוצה תור", "הזמנת סטודיו" etc.,
see `voice-menu.server.ts`) **before** the `menuMode === "ai"` early-return,
not just in "fixed" mode. Reasoning: an explicit, unambiguous "book now"
utterance should reliably end in a real reservation via the deterministic
no-AI flow (`voice-noai-booking.server.ts`) — the same guarantee "fixed"
mode always gave — rather than depend on whether the AI's own tool-calling
happens to follow through on that specific turn. This is deliberately
narrow: anything less direct (a bare date mention, a pricing question)
still goes to the AI in "ai" mode exactly as before, so its natural
flexibility for everything else is untouched. Added per a direct report
that phone bookings had stopped completing reliably after "ai" mode became
the default — if that report turns out to have had a different root cause
(e.g. `create_phone_booking` itself failing), this reorder is still a
reasonable safety net to keep, not something to revert on its own.

### Newborn-package orders actually block studio availability (2026-09-05)

Per a direct report, an admin-created newborn-package order
(`/admin/newborn-packages`, `newborn_package_orders` table — a lightweight
internal CRM, see that table's own migration comment) was expected to stop
a customer from renting the studio during the same window, and didn't.
`studioAvailability` (`availability.server.ts`) is the ONE function every
real availability check in this app calls — it reads busy time from the
`bookings` table directly and only SECONDARILY merges in Google Calendar
(`listGoogleCalendarBusy`) as an extra source, not a replacement. A Google
Calendar event alone (`newborn-orders.functions.ts`'s
`syncNewbornCalendarEvent`) is therefore a visual-only mirror that doesn't
actually protect availability if that connector isn't linked/working —
`syncNewbornBookingBlock` (same file) is the part that does: it inserts a
REAL row into `bookings` for the order's session window, exactly like any
other studio booking, and keeps it in sync (delete-then-recreate, same
pattern as the calendar sync) as the order's date/time/contact changes.

Two non-obvious things this needed:
- **`bookings.deposit_status` must NOT be `"pending"`.** `bookingBlocksSlot()`
  (`availability.server.ts`) treats a `"pending"` deposit as a temporary
  hold that EXPIRES after `PENDING_HOLD_MINUTES` (60, or
  `PHONE_BOOKING_HOLD_MINUTES` for a marked phone booking) unless renewed —
  wrong for a session an admin already committed to. Any other string
  (`syncNewbornBookingBlock` uses `"not_required"`) blocks permanently,
  matching a real booking once its deposit is actually paid.
- **`bookings.user_id` is `NOT NULL` + a real FK to `auth.users`.** A
  newborn-package customer usually has no site account at all, so the
  blocking booking is owned by the ADMIN'S OWN user id (the one
  creating/editing the order) instead of inventing a customer account just
  to satisfy the constraint — reads as "the studio owner blocked this slot
  herself," which is exactly what's happening.

Also worth knowing for next time: **supabase-js's query builder
(`PostgrestBuilder`) is `PromiseLike`-only — it implements `.then()`, NOT
`.catch()` or `.finally()`.** `someQuery.catch(() => {})` throws
`TypeError: ...catch is not a function` at runtime; use plain `await` (a
query error resolves as `{ data, error }`, it never rejects the promise
over an ordinary query failure) or check `.then()`'s own result instead.
This is different from a real `Promise`-returning function like
`deleteGoogleCalendarEvent`, which genuinely does support `.catch()`.
