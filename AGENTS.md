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
