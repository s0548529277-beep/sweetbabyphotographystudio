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

/**
 * GEMINI_API_KEY accepts several keys either comma-separated in one value
 * ("key1,key2") or as separate numbered env vars (GEMINI_API_KEY_2,
 * GEMINI_API_KEY_3, ... — whichever is easier to manage in the Lovable
 * environment-variables UI). All forms are collected and tried in order.
 */
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
        const result = await generateText({
          ...options,
          model: createDirectGeminiProvider(key)(modelId),
          abortSignal: AbortSignal.timeout(timeoutMs),
        } as GenerateTextOptions);
        await recordProviderUsed("gemini-direct", modelId);
        return result;
      } catch (e) {
        lastErr = e;
        console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} model "${modelId}" failed`, e);
      }
    }
    console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} failed on every model candidate, trying the next key`, lastErr);
  }

  if (groqKey) {
    // Same lesson as the Gemini candidates above — a provider's "current"
    // model id can get retired without notice (Groq deprecated its whole
    // Llama chat lineup in August 2026), so try a couple of candidates here
    // too instead of hardcoding one.
    const GROQ_MODEL_CANDIDATES = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
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
        console.error(`[SWEETBABY] Groq model "${modelId}" failed`, e);
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
