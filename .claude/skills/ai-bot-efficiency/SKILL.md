---
name: ai-bot-efficiency
description: Keep every AI-powered bot in this repo (site chat, phone/voice assistant, catalog search, and any future one) fast, cheap, and resilient — token-lean prompts, no wasted retries, safe fallback chains. Use this whenever touching src/lib/ai-gateway.server.ts, src/lib/ai-tools.server.ts, src/lib/ai.functions.ts, src/lib/voice-chat.server.ts, or any file that builds a system prompt / tool list for generateTextResilient, or when the user asks to make a bot cheaper, faster, more efficient, or to save on AI/API costs or tokens.
---

# AI bot efficiency — living checklist for this repo

This is a **living document**, not a one-time fix. Every time an AI-calling
code path in this app is touched, re-check it against the list below, and
**add a dated entry to the changelog at the bottom** describing what changed
and why — so the next session (or the next me) can see what's already been
tried instead of rediscovering it.

The owner explicitly wants this maintained ongoing: "סקיל מתחדש לפי הצורך
שיהיו תמיד חסכונים ויעילים" — keep the bots economical and efficient,
updating this skill as new opportunities or regressions are found.

## Core principles (apply to every bot: site chat, voice, catalog search, future ones)

1. **System prompt = only what's needed on (almost) every turn.** Anything
   relevant to a minority of requests (a detailed how-to guide, a rarely-used
   policy, a long reference table) belongs behind an on-demand **tool**, not
   inline in the system prompt. Every token in the system prompt is paid on
   *every single turn*, tool results are paid only when actually fetched.
   Precedent: the equipment-usage guide (transmitter/flash/backgrounds) used
   to be embedded in `SYSTEM` in `ai.functions.ts` (~1,800 chars, >1/3 of the
   whole prompt) and got sent even for "is Tuesday free?". Moved to the
   `get_equipment_guide` tool in `ai-tools.server.ts` — see changelog.

2. **No redundant internal retries.** `generateText`'s SDK-level retry
   (`maxRetries`, default 2 → 3 attempts with backoff) is pure waste in this
   app: `generateTextResilient` already retries across every configured key
   and then across providers (Gemini → Groq → Lovable). A quota-exceeded or
   bad-model error will not resolve by waiting a few seconds and trying the
   *same* key again — it just burns the attempt's timeout budget for nothing
   (confirmed live: a single quota error ate ~30s of a live phone call
   before the outer loop ever moved to the next key). Every `generateText`
   call in `ai-gateway.server.ts` passes `maxRetries: 0` for this reason —
   keep it that way, and apply the same rule to any new call site.

3. **Never guess a model name — discover or verify it.** Groq and Gemini
   both silently deprecate/retire model ids over time, and a bad id doesn't
   always fail fast (a nonexistent Gemini id can *hang to a full timeout*
   instead of 404ing). Prefer:
   - Querying the provider's own `/models` endpoint at runtime (see
     `fetchAvailableGroqModels`) over a hardcoded guess.
   - When you must hardcode a fallback list, only put well-established,
     long-standing model ids in it, and only as a last-resort tail after a
     dynamic lookup — never a specific new/preview name you haven't
     confirmed responds.
   - Reading the *actual* error body (see `describeApiError`) instead of a
     bare `error.message` — a generic "Bad Request" tells you nothing; the
     response body usually names the real reason (e.g. a missing
     `thought_signature`, a decommissioned model, a scope/terms issue).

4. **Log failures with enough detail to diagnose from logs alone**, since
   the fastest real debugging loop in this project is the owner exporting
   production logs. Every `catch` around a provider call should log with the
   `[SWEETBABY]` prefix, the provider/model/key identifier, and
   `describeApiError(e)` (or equivalent) — not just `console.error("failed", e)`.
   A bare unguarded call whose failure surfaces as a cryptic unhandled error
   (e.g. the Lovable-gateway 402 that used to have no `[SWEETBABY]` log line
   at all) is a bug in itself — wrap it.

5. **Prefer the provider's native SDK over a generic OpenAI-compatible shim**
   when the generic shim can't carry a provider-specific feature your prompt
   flow depends on. Precedent: Gemini's "thinking" models require a
   `thought_signature` echoed back on multi-step tool-calling turns: the
   generic `@ai-sdk/openai-compatible` transport has no field for it and
   fails almost every real request, while `@ai-sdk/google` (the native
   provider) handles it correctly. Don't try to route around a structural
   transport gap by chasing model names — fix the transport.

6. **When pinning a new package version for this repo, check its publish
   age.** Lovable/bun blocks installing a package version published less
   than ~24h ago (anti-supply-chain-attack guard) — pin an exact version
   (`"x.y.z"`, no `^`) that's a few days old, not `latest`, or the deploy
   itself will fail with `"failed to resolve"`.

7. **A quality/correctness instruction is not a token-savings target.**
   Anti-hallucination rules (always call `check_studio_availability` fresh,
   never invent a coupon code, etc.) stay in the system prompt even though
   they cost tokens — cutting them trades a real risk (wrong availability
   told to a customer, an invented discount code) for a small token savings.
   Only move/trim content that's genuinely low-relevance on most turns.

## Where this applies today

- `src/lib/ai-gateway.server.ts` — the shared resilient fallback chain
  (Gemini keys → Groq → Lovable) used by every bot. Any latency/cost/
  reliability fix belongs here so all bots inherit it at once.
- `src/lib/ai-tools.server.ts` — tool definitions shared by site chat and
  voice chat (`buildAssistantTools`). Keep tool `description`s short but
  unambiguous — they're also paid tokens on every turn.
- `src/lib/ai.functions.ts` — site chat's `SYSTEM` prompt + `chatWithBot`.
- `src/lib/voice-chat.server.ts` — voice's `VOICE_STYLE` addition + tool
  loop. Voice has a tighter latency budget (a live caller is waiting) —
  changes here matter more for speed than for the site chat's async UI.
- `src/lib/voice-booking.server.ts`, `src/lib/voice-message.server.ts` —
  voice-specific tools (`create_phone_booking`, `leave_message_for_studio`).

## Prompt caching — deliberately not added for Gemini/Groq/Lovable

Don't reach for provider prompt caching as a quick win without checking this
first — it was evaluated and correctly skipped for the current chain:

- **Gemini** (`@ai-sdk/google`): explicit caching needs a separately-created
  `cachedContents` resource with its own lifecycle (TTL management), and its
  minimum prefix is ~32K tokens on most models — this app's system prompt is
  nowhere near that (especially after the equipment-guide trim above).
  Implicit/automatic caching, if Google applies it below that floor, needs no
  code from us either way.
- **Groq**: no prompt-caching feature on the OpenAI-compatible endpoint used
  here.
- **Lovable AI Gateway**: an opaque pass-through to Google's Gemini — no
  caching control surfaced to us.
- **Claude API** (if/when added as a provider — see "Future" below): this is
  where caching is trivial and genuinely pays off — `cache_control:
  {type: "ephemeral"}` on the stable system-prompt/tool-list prefix, no
  minimum-token cliff to worry about at this app's prompt size, ~90% cheaper
  on cache reads. Add it at the same time Claude is wired in, not before.

## Future: adding Claude as a fallback tier

The owner is evaluating adding `ANTHROPIC_API_KEY` as a 4th tier in
`generateTextResilient` (after Gemini → Groq, before/alongside Lovable) —
paid pay-as-you-go, not subject to the free-tier quota walls that hit
Gemini/Groq. When that happens:
- Use the `@anthropic-ai/sdk` directly (or `@ai-sdk/anthropic` if staying
  inside the current `generateText` abstraction) — see the `claude-api`
  skill in this environment for current model ids, pricing, and API shape.
  Do not guess a model id from training-data memory; that skill's cached
  table is more current, and if the user asks for "the latest"/"current"
  model, it says to WebFetch live docs on top of that.
- Add `cache_control: {type: "ephemeral"}` on the stable prefix (system
  prompt + tool definitions) per the prompt-caching section above.
- Keep `maxRetries: 0` / equivalent for the same reason as every other tier
  (principle #2).

## Checking data files sent as prompt content, not just system prompts

Principle #1 (only what's needed on most turns) applies to **any** large
data blob interpolated into a prompt, not just the system prompt — check
`smartSearchItems` in `ai.functions.ts` as the reference case: it used to
send the *entire* product catalog (394 items, ~9,400 chars — bigger than
the equipment guide) on every single search call, regardless of the query.
Fixed by local keyword pre-filtering (match query tokens against item
name/sku/category title) before ever building the prompt, with a full-
catalog fallback only when the filter finds nothing or barely narrows
anything (a genuinely abstract query still needs full context). Measured
85-96% smaller prompts on realistic queries. When adding a new AI feature
that stuffs a JSON/data file into a prompt, always ask "does this need the
*whole* dataset, or can a cheap local filter (string match, date range,
category) narrow it down first and let the model only rank/pick from the
survivors?"

## Changelog

- **2026-08-28**: Moved the equipment-usage guide out of the always-sent
  `SYSTEM` prompt into the on-demand `get_equipment_guide` tool (principle
  #1). Removed the redundant SDK-level retry on all three
  `generateTextResilient` provider attempts via `maxRetries: 0` (principle
  #2) — real logs showed a single quota-exceeded Gemini call eating ~30s of
  a live phone call on internal retries alone. Switched Gemini's direct
  provider from `@ai-sdk/openai-compatible` to the native `@ai-sdk/google`
  (principle #5) after confirming live that the generic transport
  structurally cannot carry Gemini 3's `thought_signature` through
  multi-step tool calls. Added dynamic Groq model discovery
  (`fetchAvailableGroqModels`, principle #3) after two consecutive
  hardcoded-model-name guesses were each confirmed dead within days.
- **2026-08-28 (later same day)**: Found and fixed the single biggest token
  cost in the app — `smartSearchItems`' full-catalog dump (see the data-file
  section above). This was a bigger win than the equipment-guide move
  earlier the same day; check for more of these before assuming the
  system-prompt trims already found everything.
- **2026-08-28 (same day, later still)**: Found `find_next_available_days`
  (`nextAvailableDays` in `availability.server.ts`) was calling
  `studioAvailability()` — 2-3 network round trips including a Google
  Calendar read — separately for EACH of up to 21 scanned days, sequentially
  in a loop. Not a token cost (no AI involved in the tool's own execution)
  but the same "heavy operation that should be light" family of bug — a
  slow tool makes the whole turn slow regardless of prompt size. Batched to
  one query per data source (closures, bookings, calendar) for the whole
  date range, computed per-day locally with no network left in the loop.
  Also parallelized the two independent queries in single-day
  `studioAvailability`. This class of fix — check any loop that calls an
  async/network function per-item instead of batching — applies beyond the
  AI bots too; keep an eye out for it in any tool execution, not just prompt
  construction.
- **2026-08-28 (later still)**: Found the same per-item-network-call pattern
  a second time, in a completely different feature: `placeRecurringBooking`
  (bookings.functions.ts, a multi-week recurring series) called
  `studioAvailability()` once per week, sequentially — up to 13 calls × 2-3
  round trips each. Extracted the batch-fetch logic that fixed
  `nextAvailableDays` into a shared exported helper,
  `fetchAvailabilityBatch(fromDate, toDate)` in availability.server.ts —
  both callers now do 3 network calls total regardless of range size. Safe
  because each week in a recurring series is a distinct date (always 7 days
  apart), so no week's availability check depends on another week's result
  within the same call. **Pattern to keep checking for**: any loop over
  dates/items that calls an availability/network function per iteration —
  this was the second instance found in one day, there may be more.
- **2026-08-29**: Found a reliability bug, not a cost/latency one, but same
  root cause family (a resilient fallback chain doing nothing if the code
  around it is wrong). `api.yemot.ivr.ts` and `api.voice.respond.ts` each
  define a shared `runOpenTurn` helper (the actual AI-turn call) and every
  stage that falls through to it did `return runOpenTurn(speech)` — a bare
  return of an un-awaited promise inside the route's own `try` block. When
  ALL THREE fallback tiers failed in the same call (confirmed live: Gemini
  free-tier quota exhausted on both keys, every discovered/static Groq
  candidate broken, Lovable out of credits), the rejection never reached
  that `try`'s `catch` — a `try { return promise; }` does NOT catch a later
  rejection of `promise` unless it's awaited first. The rejection escaped
  the whole route handler uncaught, and the runtime turned the AI SDK
  error's own `.statusCode` (402, from Lovable's "out of credits") into the
  literal HTTP response status sent back to Yemot/Twilio — instead of the
  graceful `phrases.temporary_error` fallback this file was clearly built to
  give. Fixed by changing every call site to `return await runOpenTurn(...)`
  (8 call sites total across both files). **Lesson for this codebase**: any
  `return someAsyncFn(...)` inside a `try` block whose `catch` is meant to
  handle that call's failures is a live bug — always `return await`.
  Same log batch also showed Groq's dynamically-discovered candidates
  reliably dying on `allam` (no tool-calling support) and `qwen` (this app's
  ~9K-token voice request always exceeds the account's 8000 TPM cap for
  that model) — added both to `GROQ_UNUSABLE_MODEL_ID` so those attempts
  aren't wasted, and bumped the discovery slice 4→6 to keep the same pool
  size of real candidates after excluding two more prefixes. The underlying
  quota/credit exhaustion itself (Gemini free tier, Lovable balance) is a
  capacity/billing issue, not a code bug — flagged to the user rather than
  "fixed", since there's no code-level fix for an account being out of
  quota/credits.
- **2026-08-29 (later)**: The owner asked for more accurate TTS pronunciation
  (niqqud/vowel points) on the voice bot's spoken replies, explicitly
  conditioned on not making it less efficient. Considered and rejected:
  asking the model to add niqqud to its own free-form replies — that would
  cost real extra *output* tokens (niqqud are combining Unicode marks that
  don't compress well under BPE) on every single voice turn, plus the extra
  generation time to produce them, on a call where a live caller is
  waiting — a real, recurring cost for a benefit limited to a handful of
  words, with the added risk of the model producing *wrong* niqqud that
  sounds worse than none. Shipped instead: `applyNiqqudFixups` in
  `voice-chat.server.ts` — a small hardcoded word→niqqud'd-word dictionary
  (שריון, מקדמה, הדרכה, הגעה, אביזרים, חלאקה — spellings matched to the
  existing hand-vocalized fixed phrases in `voice-phrases.server.ts` for
  consistency) applied as a deterministic string-replace on the model's
  *already-generated* reply, the same pattern already used for
  `stripEchoOpener`. Zero AI tokens, zero added latency. **Pattern for this
  codebase**: when quality trades directly against tokens/latency, look for
  a deterministic post-processing fix before reaching for a prompt
  instruction — a fixed/known-vocabulary substitution belongs in code, not
  in every model call. **Reverted the same day**: the owner listened to the
  actual call and confirmed the hand-picked niqqud itself was wrong — this
  environment has no way to hear real Yemot TTS output to verify a
  vocalization is correct before shipping it, so a guessed niqqud fixup is
  exactly the kind of unverifiable guess principle #3 warns against for
  model names, just applied to a different kind of string. The mechanism
  (deterministic post-processing, zero token cost) was sound; the *content*
  wasn't verifiable from here. Don't re-add a niqqud dictionary without a
  real way to confirm the vocalization against actual TTS audio first.
- **2026-08-29 (later)**: Added two admin-only voice tools
  (admin_business_snapshot, admin_open_door_now — voice-admin.server.ts) —
  not primarily an efficiency change, but worth noting the pattern: they're
  spread into buildVoiceTools' return object only `...(isAdminVoiceCaller(callerPhone)
  ? {...} : {})`, so a regular customer's tool list — and prompt token
  count — never includes them at all. Conditionally-present tools based on
  caller identity is a real token-savings lever beyond principle #1's
  "move rarely-needed content to a tool" — some tools shouldn't even be
  offered most of the time, not just described briefly.
