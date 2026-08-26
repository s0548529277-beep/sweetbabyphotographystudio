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
export async function generateTextResilient(options: GenerateTextOptionsNoModel) {
  const geminiKeys = (process.env.GEMINI_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (geminiKeys.length === 0 && !lovableKey) throw new Error("Missing GEMINI_API_KEY or LOVABLE_API_KEY");

  for (const key of geminiKeys) {
    try {
      // "gemini-2.5-flash" is what the Lovable gateway's own model alias
      // resolves internally — going straight to Google's API needs
      // Google's own current model id, which isn't the same thing and
      // drifts over time (confirmed live: this exact string 404'd with
      // "Not Found" against the direct endpoint on 2026-08-27, while the
      // gateway path below kept working under the old name).
      return await generateText({ ...options, model: createDirectGeminiProvider(key)("gemini-3-flash-preview") } as GenerateTextOptions);
    } catch (e) {
      console.error(`[SWEETBABY] Gemini key ...${key.slice(-4)} failed, trying the next one`, e);
    }
  }
  if (!lovableKey) throw new Error("All Gemini keys failed and no LOVABLE_API_KEY is configured as a fallback");
  console.error("[SWEETBABY] all Gemini keys failed, falling back to Lovable AI Gateway");
  return generateText({
    ...options,
    model: createLovableAiGatewayProvider(lovableKey)("google/gemini-2.5-flash"),
  } as GenerateTextOptions);
}
