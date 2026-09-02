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
`yemot.server.ts`'s `yemotSayThenContinue`, `api.yemot.ivr.ts`'s
`ai_pending` stage) — see `THINKING_FILLER_KEY`'s own doc comment in
`voice-phrases.server.ts` for the full mechanism. Short version: Yemot's
protocol is fully synchronous, so an AI turn that takes several seconds
(up to 30s, up to 6 tool-call rounds — see `runVoiceTurn`'s own comment for
why that budget isn't safe to shrink) means the caller hears total silence
the whole time. This setting makes the bot say `phrases.thinking_filler`
("רגע אחד...") immediately via a bare `id_list_message` (no `read`, no
`go_to_folder` after it), which — per this file's own protocol notes,
sourced from the `yemot-router2` library — re-hits the same URL on its own
with no new input; that follow-up hit does the real (slow) work. **It does
not make the AI faster, only fills the dead air.**

Toggle at `/admin/voice-bot-text` (new "מענה מיידי בזמן שהבינה חושבת"
card), **defaults OFF** — unlike this file's other admin toggles (which
default to their new behavior), because the one load-bearing assumption (a
bare `id_list_message` really does auto-continue rather than hang up right
after speaking) had, as of this writing, only ever been exercised in this
codebase combined with `go_to_folder=hangup` (`yemotSayAndHangup`) — never
alone, never confirmed on a real live call. If you're reading this because
it's now been tested: update this note with the result. If it turned out
to hang up instead of continuing, the fix is a different directive shape
in `yemotSayThenContinue`, not a revert of the whole mechanism.
