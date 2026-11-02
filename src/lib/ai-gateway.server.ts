import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

/**
 * Talks to Google's Gemini API directly, bypassing the Lovable AI Gateway
 * entirely — Google's own pricing/quota instead of the gateway's shared pool
 * + markup, dedicated to whatever feature is given this key (currently: the
 * voice call assistant, see voice-chat.server.ts).
 *
 * This used to go through @ai-sdk/openai-compatible (Google's OpenAI-
 * compatible endpoint) — but real logs confirmed that transport CANNOT work
 * with this app's multi-step tool-calling flow against Gemini's "thinking"
 * models: Gemini attaches a thought_signature to every function-call part
 * and requires it echoed back on the next step, and the OpenAI-compat JSON
 * shape has nowhere to carry that field, so Google rejects the follow-up
 * with 400 "Function call is missing a thought_signature" on basically
 * every real request (confirmed live, see git history for the exact error).
 * Google is also retiring its non-thinking flash tiers in favor of the
 * Gemini 3.x thinking family (confirmed live: gemini-2.0-flash 404s now,
 * telling callers to switch to gemini-3.6-flash) — so avoiding thinking
 * models entirely isn't a lasting fix either.
 * @ai-sdk/google is Vercel's own native provider for Gemini: it speaks
 * Google's actual protocol (not an OpenAI translation) and threads
 * thought signatures through multi-step tool calls correctly, which is
 * exactly the gap the OpenAI-compat transport couldn't cross.
 */
export function createDirectGeminiProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}

/**
 * Groq's OpenAI-compatible endpoint — a fast, separate provider used as a
 * middle fallback tier (after the direct Gemini keys, before the Lovable
 * gateway) so a Gemini outage or a Lovable billing issue don't both have to
 * be down at once to break every AI feature on the site.
 */
export function createGroqProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

type GenerateTextOptions = Parameters<typeof generateText>[0];
type GenerateTextOptionsNoModel = Omit<GenerateTextOptions, "model">;

// Default per-attempt cap for the text-chat / catalog-search callers, which
// have no live connection to time out — they can afford to actually wait
// for a slow-but-working key instead of failing over prematurely. The voice
// callers pass a much tighter timeoutMs (see runVoiceTurn) because on a
// phone call, unlike a browser waiting on a fetch, the *platform itself*
// (Twilio/Yemot) is also independently timing out the webhook — if this
// function is still retrying keys when that fires, the caller just hears a
// platform-level "no response from the API server" and the call dies
// regardless of what this function eventually would have returned. Every
// Gemini key attempt plus the Lovable fallback all share this same budget,
// so the real worst case is roughly (number of keys + 1) × timeoutMs — keep
// that in mind when configuring how many GEMINI_API_KEY values to stack for
// a voice-facing caller.
const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Shared entry point for every AI feature on the site (site chat, catalog
 * search, the voice assistant) — same model choice and same fallback chain
 * everywhere instead of each call site reimplementing it.
 *
 * GEMINI_API_KEY can hold *several* keys — from different Google
 * accounts/projects — separated by commas, tried one after another before
 * ever touching the shared gateway. That matters because a live request is
 * not the place to discover a key is unusable (a fresh Google Cloud project
 * can need billing enabled before it serves requests at all, even within
 * the free quota, and a quota can simply run out) — so any failure just
 * moves to the next key instead of failing the whole request. Once every
 * Gemini key has failed, it falls back directly to the shared
 * LOVABLE_API_KEY gateway. Groq is skipped while this account's live model
 * listing exposes no compatible chat/tool model. Throws
 * only if nothing at all is configured, or every configured option failed.
 */
// Best-effort: records which provider/model actually served the last
// successful request in a singleton DB row (ai_provider_status), and — only
// when it's actually *different* from what served the previous call, i.e. a
// real failover or recovery — drops a one-line note in admin_notifications.
// Never awaited by the caller in a way that could slow the response down
// meaningfully (one small upsert), and never throws.
//
// 2026-11-02 speed fix: this used to run 2-3 sequential DB round trips AFTER
// EVERY AI reply, before the answer was returned to the customer. The status
// only changes on a real failover, so skip the DB entirely when this isolate
// already recorded the same provider/model in the last 5 minutes.
const PROVIDER_RECORD_TTL_MS = 5 * 60_000;
let lastRecordedProvider: { key: string; at: number } | null = null;
async function recordProviderUsed(provider: string, model: string): Promise<void> {
  const recordKey = `${provider}/${model}`;
  if (lastRecordedProvider && lastRecordedProvider.key === recordKey && Date.now() - lastRecordedProvider.at < PROVIDER_RECORD_TTL_MS) return;
  lastRecordedProvider = { key: recordKey, at: Date.now() };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await (supabaseAdmin.from("ai_provider_status") as any).select("provider, model").eq("id", true).maybeSingle();
    await (supabaseAdmin.from("ai_provider_status") as any).upsert(
      { id: true, provider, model, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (prev && (prev.provider !== provider || prev.model !== model)) {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "ai_provider_switch",
        title: `🔀 מעבר ספק AI: ${prev.provider ?? "?"}/${prev.model ?? "?"} → ${provider}/${model}`,
        body: { from: prev, to: { provider, model } },
      });
    }
  } catch (e) {
    console.error("[SWEETBABY] recordProviderUsed failed", e);
  }
}

// Groq has now silently dropped TWO guessed model names on us in a row
// (openai/gpt-oss-* hit a real SDK bug, and the "safe" replacement,
// llama-3.3-70b-versatile, turned out to already be deprecated on this
// specific account — confirmed live via
// "AI_APICallError: The model `llama-3.3-70b-versatile` does not exist or
// you do not have access to it."). Guessing a third specific name is the
// same mistake again. Groq's /models endpoint lists exactly what this key
// can actually use right now, so ask it instead of guessing — and unlike a
// bad Gemini model id (which can hang to a full timeout), a bad Groq model
// id fails FAST with a clear APICallError (confirmed in the same logs), so
// trying a short list of fallback names after the dynamic pick costs very
// little if discovery itself fails.
// gpt-oss is skipped even though it's "available" — known reasoning_content
// SDK bug on every tool-calling turn (see below). "compound" is skipped too
// — confirmed live via a real error: Groq's "compound" models are an agentic
// system of their own and reject this app's tool-calling requests outright
// ('"tool calling" is not supported with this model'). whisper/tts/guard/
// moderation/embed are non-chat models entirely.
// "orpheus"/"canopylabs" are Groq's text-to-speech voice models (confirmed
// live: they show up in /models but reject a normal chat request with
// "requires terms acceptance") — not chat/tool-calling models at all.
// "allam" is Groq's Arabic-focused model — confirmed live it rejects every
// call outright with '"tool calling" is not supported with this model',
// same failure shape as compound. "qwen" is skipped for a different reason:
// confirmed live it 429s on EVERY call with "Request too large ... on tokens
// per minute (TPM): Limit 8000, Requested ~9100-9200" — this app's system
// prompt + tool schemas alone run ~9K tokens on a voice turn, so a model
// capped at 8000 TPM on this account can structurally never complete a
// single call here, not just occasionally rate-limit. Both are dead weight
// in the candidate list: they cost a full failed attempt (and, for qwen, a
// distinctive-sounding but pointless 429) before falling through to the next
// real option.
const GROQ_UNUSABLE_MODEL_ID = /gpt-oss|compound|whisper|tts|guard|moderation|embed|orpheus|canopylabs|allam|qwen/i;

// Returns several usable candidates, not just one — a single dynamically
// discovered model can itself turn out to be unusable for a reason the
// /models listing doesn't expose (a transient timeout, a feature gap like
// "compound" above), so the resilient thing is to let the existing
// try-next-candidate loop fall through several real options instead of
// discovery being just one more single point of failure.
async function fetchAvailableGroqModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    // Real logs showed a whole batch where every Groq attempt fell straight
    // through to the 3 hardcoded last-resort names (all confirmed dead —
    // "decommissioned"/"does not exist") with NO error logged anywhere for
    // discovery itself — meaning this call was silently swallowing an
    // invalid-key (401) or similar failure right here, leaving no way to
    // tell "the key is bad" apart from "the account genuinely has zero
    // usable models" from the logs alone. Log the real status/body instead
    // of guessing next time.
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[SWEETBABY] Groq /models discovery failed: ${res.status} ${body.slice(0, 300)}`);
      return [];
    }
    const data: any = await res.json();
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m?.id).filter((id: unknown): id is string => typeof id === "string")
      : [];
    // Bumped from 4 to 6 now that GROQ_UNUSABLE_MODEL_ID excludes more
    // prefixes (allam, qwen) — keeps roughly the same number of real
    // candidates surviving the filter instead of quietly shrinking the pool.
    const usable = ids.filter((id) => !GROQ_UNUSABLE_MODEL_ID.test(id)).slice(0, 6);
    if (ids.length > 0 && usable.length === 0) {
      // Discovery worked but EVERY listed model got filtered out as
      // unusable — worth knowing which ids were actually offered, in case
      // the unusable-pattern regex is now too broad.
      console.error(`[SWEETBABY] Groq /models returned ${ids.length} model(s), all filtered as unusable: ${ids.slice(0, 15).join(", ")}`);
    }
    return usable;
  } catch (e) {
    console.error("[SWEETBABY] fetchAvailableGroqModels failed", e);
    return [];
  }
}

/**
 * GEMINI_API_KEY accepts several keys either comma-separated in one value
 * ("key1,key2") or as separate numbered env vars (GEMINI_API_KEY_2,
 * GEMINI_API_KEY_3, ... — whichever is easier to manage in the Lovable
 * environment-variables UI). All forms are collected and tried in order.
 */
// A bare "AI_APICallError: Bad Request" tells us almost nothing — the real
// reason (which field Google's OpenAI-compat layer actually rejected) is in
// the response body, which the SDK does NOT put in .message/.toString().
// The user replaced the Gemini key that was failing this way and the SAME
// key-agnostic "Bad Request" reproduced identically on the new key — strong
// evidence this was never a key/account problem, but something about the
// request itself (model id, or a payload shape the direct endpoint doesn't
// accept) that Google is rejecting regardless of which key sends it. Log the
// actual response body so the next exported log batch shows the real reason
// instead of another guess.
function describeApiError(e: unknown): string {
  const err = e as any;
  const bodyRaw = err?.responseBody;
  const body = typeof bodyRaw === "string" ? bodyRaw.slice(0, 500) : undefined;
  return JSON.stringify({ statusCode: err?.statusCode, responseBody: body, cause: err?.cause?.message });
}

function collectGeminiKeys(): string[] {
  const keys = (process.env.GEMINI_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  for (let i = 2; i <= 6; i++) {
    const v = process.env[`GEMINI_API_KEY_${i}`];
    if (v?.trim()) keys.push(v.trim());
  }
  return keys;
}

// Streaming (2026-11-02): the site chat streams its reply to the browser as it
// is written (see chat-stream.server.ts). Streaming can't be raced across keys
// like generateTextResilient does, so it uses ONE direct Gemini key (picked at
// random to spread quota) and the caller falls back to generateTextResilient
// if the stream fails before producing an answer. Keep the model id and
// thinking level in sync with generateTextResilient above.
const GEMINI_STREAM_MODEL_ID = "gemini-3-flash-preview";
const GEMINI_STREAM_THINKING_LEVEL = "low" as const;

/** Returns a direct Gemini model for streamText, or null when no Gemini key is configured. */
export function pickStreamingGeminiModel() {
  const keys = collectGeminiKeys();
  if (keys.length === 0) return null;
  const key = keys[Math.floor(Math.random() * keys.length)];
  return {
    model: createDirectGeminiProvider(key)(GEMINI_STREAM_MODEL_ID),
    providerOptions: { google: { thinkingConfig: { thinkingLevel: GEMINI_STREAM_THINKING_LEVEL } } },
  };
}

// Website chat only (2026-11-02, owner request: "the site bot goes straight to
// Lovable's AI provider, no switching between providers"). No Gemini keys, no
// racing, no fallback to another provider and NO provider-switch notifications:
// one call to the Lovable AI Gateway. Voice, WhatsApp and the email assistant
// keep using generateTextResilient. If the Lovable AI credits run out the site
// chat shows its normal "busy" message (the gateway answers 402).
const LOVABLE_CHAT_MODEL_ID = "google/gemini-3-flash-preview";
// Older, known-good model used only if the call above is rejected (e.g. the
// gateway refuses the reasoning setting or the Gemini 3 tool loop).
const LOVABLE_CHAT_SAFE_MODEL_ID = "google/gemini-2.5-flash";
// Short "thinking" for the site chat (owner request 2026-11-02: answers too slow).
// Lovable's chat confirmed the gateway accepts reasoning effort; not verified live.
export const LOVABLE_CHAT_PROVIDER_OPTIONS = {
  "lovable-ai-gateway": { reasoningEffort: "low" },
} as const;

/** The Lovable AI Gateway model used by the website chat (also for streamText). */
export function getLovableChatModel(modelId: string = LOVABLE_CHAT_MODEL_ID) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key)(modelId);
}

export async function generateTextLovable(options: GenerateTextOptionsNoModel, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    return await generateText({
      ...options,
      model: getLovableChatModel(),
      providerOptions: { ...(options.providerOptions ?? {}), ...LOVABLE_CHAT_PROVIDER_OPTIONS },
      abortSignal: AbortSignal.timeout(timeoutMs),
      maxRetries: 0,
    } as GenerateTextOptions);
  } catch (e) {
    console.error(`[SWEETBABY] Lovable AI Gateway (site chat, fast model) failed ${e} | detail=${describeApiError(e)}`);
    // Out of credits: the safe model would fail the same way.
    if ((e as { statusCode?: number })?.statusCode === 402) throw e;
    try {
      return await generateText({
        ...options,
        model: getLovableChatModel(LOVABLE_CHAT_SAFE_MODEL_ID),
        abortSignal: AbortSignal.timeout(timeoutMs),
        maxRetries: 0,
      } as GenerateTextOptions);
    } catch (e2) {
      console.error(`[SWEETBABY] Lovable AI Gateway (site chat, safe model) failed ${e2} | detail=${describeApiError(e2)}`);
      throw e2;
    }
  }
}

export async function generateTextResilient(options: GenerateTextOptionsNoModel, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const geminiKeys = collectGeminiKeys();
  const groqKey = process.env.GROQ_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (geminiKeys.length === 0 && !groqKey && !lovableKey) throw new Error("Missing GEMINI_API_KEY, GROQ_API_KEY, or LOVABLE_API_KEY");

  // Long history of model-id churn here (see git log for the full trail:
  // "gemini-2.5-flash" 404'd, "gemini-3.7-flash" hung to a timeout instead
  // of failing fast, "gemini-2.0-flash" is now retired too — Google's own
  // 404 body says "no longer available... use gemini-3.6-flash"). The
  // deeper issue turned out not to be the model id at all: it was that
  // createDirectGeminiProvider used to go through the generic OpenAI-
  // compatible transport, which structurally cannot support Gemini's
  // "thinking" models in a multi-step tool-calling flow (confirmed live —
  // see createDirectGeminiProvider's doc comment for the thought_signature
  // story). That's now fixed by switching to @ai-sdk/google, Google's own
  // native provider — so a current, real, actively-supported model can be
  // used again instead of chasing the shrinking set of non-thinking ones.
  // "gemini-flash-latest" was tried as a second candidate too — but real
  // logs showed it HANGS to a full TimeoutError rather than failing fast
  // (the same pattern confirmed earlier with "gemini-3.7-flash": a model id
  // that isn't valid for this API surface doesn't always 404 quickly). Not
  // worth the latency cost, so back to a single known-working candidate.
  const DIRECT_GEMINI_MODEL_CANDIDATES = ["gemini-3-flash-preview"];

  // 2026-11-02 speed fix: gemini-3-flash-preview is a "thinking" model and
  // defaults to a deep thinking level — every step of a tool loop (up to 8 on
  // the site chat) paid for it, several seconds each. A booking/FAQ assistant
  // doesn't need deep reasoning, so ask for "low" (the SDK's own typings in
  // @ai-sdk/google 4.0.53 list: minimal | low | medium | high). Still a
  // thinking model, so thought_signatures keep working on multi-step tool
  // calls. If answers about availability/prices ever get worse, raise this to
  // "medium" here — one place, all bots.
  const GEMINI_THINKING_LEVEL = "low" as const;

  // The AI SDK retries a failed call internally by default (3 attempts with
  // backoff) — real logs showed this burning most of a 30s budget on a
  // single quota-exceeded error ("Please retry in 31.48s") before this
  // function's OWN outer loop ever got to try the next key/provider. A
  // customer on a live call heard dead air for that whole window. A quota
  // limit or a "model doesn't exist" error will not resolve by retrying
  // seconds later, and this function already retries — across every
  // configured key, then Groq, then Lovable — so the SDK's own retries are
  // redundant at best and actively harmful (wasted time) at worst. Disabled
  // everywhere in this file for that reason.
  const NO_INTERNAL_RETRY = { maxRetries: 0 } as const;

  if (geminiKeys.length > 0) {
    // Tried one key after another until real logs showed BOTH configured
    // keys failing via `TimeoutError: The operation was aborted due to
    // timeout` back to back on the same live call — sequentially, that's a
    // worst case of (number of keys) × timeoutMs of dead air (60s for 2
    // keys at the 30s voice budget) before the flow even reaches Groq/
    // Lovable, which is exactly what a caller experiences as the bot
    // "getting stuck". The fix is NOT to shrink timeoutMs — that generous
    // budget was set deliberately per direct feedback ("תתן לו אפילו חצי
    // דקה") after a tighter one (10s) was shown to cut off legitimately
    // slow-but-working calls (a real availability check needs a Supabase
    // query + a Google Calendar round trip + the model's own reasoning).
    // Instead, race every configured key IN PARALLEL: worst case is bounded
    // to a single timeoutMs no matter how many keys exist, while a single
    // slow-but-eventually-successful key still gets its full budget. Each
    // attempt gets its own AbortController so the instant one key succeeds,
    // every other in-flight request is cancelled immediately rather than
    // continuing to burn quota/cost in the background for a result nobody
    // needs. With a single key configured this degenerates to exactly the
    // old sequential behavior — no change for that common case.
    const activeControllers: AbortController[] = [];
    const cancelOthers = () => {
      for (const c of activeControllers) if (!c.signal.aborted) c.abort();
    };

    const attempts = geminiKeys.map(async (key) => {
      let lastErr: unknown;
      for (const modelId of DIRECT_GEMINI_MODEL_CANDIDATES) {
        const controller = new AbortController();
        activeControllers.push(controller);
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const result = await generateText({
            ...options,
            model: createDirectGeminiProvider(key)(modelId),
            abortSignal: controller.signal,
            providerOptions: {
              ...(options.providerOptions ?? {}),
              google: { thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL }, ...((options.providerOptions as any)?.google ?? {}) },
            },
            ...NO_INTERNAL_RETRY,
          } as GenerateTextOptions);
          return { modelId, result };
        } catch (e) {
          lastErr = e;
          console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} model "${modelId}" failed ${e} | detail=${describeApiError(e)}`);
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastErr ?? new Error(`Gemini key ...${key.slice(-4)} exhausted all model candidates`);
    });

    try {
      const { modelId, result } = await Promise.any(attempts);
      cancelOthers();
      await recordProviderUsed("gemini-direct", modelId);
      return result;
    } catch (e) {
      console.error("[SWEETBABY] every Gemini key failed (raced in parallel, each up to its own full timeout budget)", e);
    }
  }

  if (groqKey) console.error("[SWEETBABY] Groq fallback skipped: this account has no compatible chat/tool model");

  if (!lovableKey) throw new Error("All Gemini attempts failed and no LOVABLE_API_KEY is configured as a fallback");
  console.error("[SWEETBABY] all Gemini attempts failed, falling back to Lovable AI Gateway");
  try {
    const lovableResult = await generateText({
      ...options,
      model: createLovableAiGatewayProvider(lovableKey)("google/gemini-2.5-flash"),
      abortSignal: AbortSignal.timeout(timeoutMs),
      ...NO_INTERNAL_RETRY,
    } as GenerateTextOptions);
    await recordProviderUsed("lovable-gateway", "google/gemini-2.5-flash");
    return lovableResult;
  } catch (e) {
    // This used to be an unguarded call — a real failure here (e.g. a bare
    // "402 Payment Required" seen live, meaning the Lovable AI credits
    // balance is empty) surfaced only as a cryptic unhandled HTTPError with
    // no [SWEETBABY] prefix, easy to miss in the logs and impossible to
    // tell apart from any other crash. This is the LAST fallback — if it
    // fails, every provider failed and the caller genuinely gets nothing,
    // so log it clearly (with enough detail to diagnose without guessing)
    // before rethrowing.
    console.error(`[SWEETBABY] Lovable AI Gateway (last-resort fallback) also failed ${e} | detail=${describeApiError(e)}`);
    throw e;
  }
}
