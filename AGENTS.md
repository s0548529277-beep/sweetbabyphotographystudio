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

## Phone voice bot (Twilio) — TTS voice

The phone AI assistant ("נועה") is built on **Twilio** (`src/lib/twilio.server.ts`,
`src/lib/voice-chat.server.ts`, `src/routes/api.voice.incoming.ts`,
`src/routes/api.voice.respond.ts`) — TwiML webhooks, not a direct call to any
TTS API. **There is no Google Cloud Text-to-Speech API call and no ימות
המשיח (Yemot Hamashiach) integration anywhere in this repo** — confirmed by
an exhaustive search (code, git history, env vars) on 2026-08-25, after a
user asked to change a bot's voice and it turned out they may have been
thinking of a different phone bot / project. If a future request references
either of those and you can't find matching code, don't guess — say so and
ask whether it's a separate Lovable project.

The TTS voice is admin-configurable at **`/admin/voice-bot`**, not
hardcoded: it reads/writes `app_settings` (key `"voice_bot_voice"`, values
`"default" | "female" | "male"`). Twilio's `<Say>` proxies non-English TTS
through Google Cloud voices via its `voice` attribute — see
`src/lib/voice-bot-options.ts` for the exact voice IDs
(`Google.he-IL-Wavenet-C` / `-D`) and `src/lib/voice-settings.server.ts` for
how the choice is resolved into that attribute string server-side.

`voice-bot-options.ts` (plain constants, no `.server` suffix) is
deliberately separate from `voice-settings.server.ts` (touches
`supabaseAdmin`) so the admin picker page can import the constants without
pulling server-only code into the client bundle — this project's
`*.server.ts` files are a hard client/server boundary; importing one from a
client-rendered route component breaks the build.
