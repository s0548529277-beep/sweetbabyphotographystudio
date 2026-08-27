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
 * Talks to Google's Gemini API directly (its OpenAI-compatible endpoint),
 * bypassing the Lovable AI Gateway entirely — Google's own pricing/quota
 * instead of the gateway's shared pool + markup, dedicated to whatever
 * feature is given this key (currently: the voice call assistant, see
 * voice-chat.server.ts). Model names here have no "google/" prefix —
 * that's a Lovable gateway naming convention, not Google's.
 */
export function createDirectGeminiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "gemini-direct",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
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
 * moves to the next key instead of failing the whole request. Only once
 * every Gemini key has failed does it fall back to the shared
 * LOVABLE_API_KEY gateway (which we know works), as the last resort.
 * Throws only if nothing at all is configured.
 */
export async function generateTextResilient(options: GenerateTextOptionsNoModel, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const geminiKeys = (process.env.GEMINI_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (geminiKeys.length === 0 && !lovableKey) throw new Error("Missing GEMINI_API_KEY or LOVABLE_API_KEY");

  // "gemini-2.5-flash" is what the Lovable gateway's own model alias
  // resolves internally — going straight to Google's API needs Google's own
  // current model id, which isn't the same thing and drifts over time as
  // preview releases get retired in favor of GA ones. This has now 404'd
  // TWICE live (once as "gemini-2.5-flash" itself against the direct
  // endpoint, then again after being updated to "gemini-3-flash-preview" a
  // day later) — so instead of chasing one hardcoded name again, try a
  // short list of candidates (newest first) per key before giving up on
  // that key. A 404 on a bad model id returns almost immediately, so this
  // doesn't meaningfully add to worst-case latency.
  const DIRECT_GEMINI_MODEL_CANDIDATES = ["gemini-3.7-flash", "gemini-3-flash-preview"];

  for (const key of geminiKeys) {
    let lastErr: unknown;
    for (const modelId of DIRECT_GEMINI_MODEL_CANDIDATES) {
      try {
        return await generateText({
          ...options,
          model: createDirectGeminiProvider(key)(modelId),
          abortSignal: AbortSignal.timeout(timeoutMs),
        } as GenerateTextOptions);
      } catch (e) {
        lastErr = e;
        console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} model "${modelId}" failed`, e);
      }
    }
    console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} failed on every model candidate, trying the next key`, lastErr);
  }
  if (!lovableKey) throw new Error("All Gemini keys failed and no LOVABLE_API_KEY is configured as a fallback");
  console.error("[SWEETBABY] all Gemini keys failed, falling back to Lovable AI Gateway");
  return generateText({
    ...options,
    model: createLovableAiGatewayProvider(lovableKey)("google/gemini-2.5-flash"),
    abortSignal: AbortSignal.timeout(timeoutMs),
  } as GenerateTextOptions);
}
