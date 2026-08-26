import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
