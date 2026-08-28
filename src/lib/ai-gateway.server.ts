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
 * Gemini key has failed, it tries GROQ_API_KEY (a separate provider, so a
 * Google-side outage doesn't take this down too), and only after that falls
 * back to the shared LOVABLE_API_KEY gateway as the last resort. Throws
 * only if nothing at all is configured, or every configured option failed.
 */
// Best-effort: records which provider/model actually served the last
// successful request in a singleton DB row (ai_provider_status), and — only
// when it's actually *different* from what served the previous call, i.e. a
// real failover or recovery — drops a one-line note in admin_notifications.
// Never awaited by the caller in a way that could slow the response down
// meaningfully (one small upsert), and never throws.
async function recordProviderUsed(provider: string, model: string): Promise<void> {
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
const GROQ_UNUSABLE_MODEL_ID = /gpt-oss|compound|whisper|tts|guard|moderation|embed/i;

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
    if (!res.ok) return [];
    const data: any = await res.json();
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m?.id).filter((id: unknown): id is string => typeof id === "string")
      : [];
    return ids.filter((id) => !GROQ_UNUSABLE_MODEL_ID.test(id)).slice(0, 4);
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
  const DIRECT_GEMINI_MODEL_CANDIDATES = ["gemini-3-flash-preview", "gemini-flash-latest"];

  for (const key of geminiKeys) {
    let lastErr: unknown;
    for (const modelId of DIRECT_GEMINI_MODEL_CANDIDATES) {
      try {
        const result = await generateText({
          ...options,
          model: createDirectGeminiProvider(key)(modelId),
          abortSignal: AbortSignal.timeout(timeoutMs),
        } as GenerateTextOptions);
        await recordProviderUsed("gemini-direct", modelId);
        return result;
      } catch (e) {
        lastErr = e;
        console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} model "${modelId}" failed ${e} | detail=${describeApiError(e)}`);
      }
    }
    console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} failed on every model candidate, trying the next key`, lastErr);
  }

  if (groqKey) {
    // "openai/gpt-oss-120b"/"-20b" were tried here first, on Groq's own
    // recommendation — but real logs showed both fail on EVERY multi-step
    // tool-calling turn (which is every turn in this app) with:
    //   'messages.N': for 'role:assistant' ... 'reasoning_content' is unsupported
    // This is a known, still-open Vercel AI SDK ↔ Groq compatibility gap
    // (github.com/vercel/ai issue #8056): gpt-oss is a reasoning model, the
    // SDK echoes its own reasoning_content back as conversation history on
    // the next tool-calling step, and Groq's API rejects that echo outright.
    // "llama-3.3-70b-versatile" was tried next as a plain non-reasoning
    // model — but real logs then showed THIS is deprecated/inaccessible on
    // this specific account too. Rather than guess a fourth name, ask
    // Groq's own /models endpoint what this key can actually use right now,
    // and only fall back to hardcoded guesses if that lookup itself fails.
    // llama-3.1-8b-instant, gemma2-9b-it, and llama3-70b-8192 are ALSO now
    // confirmed live to be decommissioned on Groq's side entirely (not just
    // unavailable to this account) — kept only as a last-resort tail in case
    // discovery itself fails, not because they're expected to work.
    const discoveredModels = await fetchAvailableGroqModels(groqKey);
    const GROQ_MODEL_CANDIDATES = [
      ...discoveredModels,
      "llama-3.1-8b-instant",
      "gemma2-9b-it",
      "llama3-70b-8192",
    ].filter((id, i, arr) => arr.indexOf(id) === i);
    for (const modelId of GROQ_MODEL_CANDIDATES) {
      try {
        const result = await generateText({
          ...options,
          model: createGroqProvider(groqKey)(modelId),
          abortSignal: AbortSignal.timeout(timeoutMs),
        } as GenerateTextOptions);
        await recordProviderUsed("groq", modelId);
        return result;
      } catch (e) {
        console.error(`[SWEETBABY] Groq model "${modelId}" failed ${e}`);
      }
    }
    console.error("[SWEETBABY] Groq failed on every model candidate, falling back to Lovable AI Gateway");
  }

  if (!lovableKey) throw new Error("All Gemini/Groq attempts failed and no LOVABLE_API_KEY is configured as a fallback");
  console.error("[SWEETBABY] all Gemini/Groq attempts failed, falling back to Lovable AI Gateway");
  const lovableResult = await generateText({
    ...options,
    model: createLovableAiGatewayProvider(lovableKey)("google/gemini-2.5-flash"),
    abortSignal: AbortSignal.timeout(timeoutMs),
  } as GenerateTextOptions);
  await recordProviderUsed("lovable-gateway", "google/gemini-2.5-flash");
  return lovableResult;
}
