/**
 * Central catalog of AI model IDs per provider.
 * Single source of truth to avoid deprecated-model errors.
 *
 * When a provider deprecates a model, update the value here and every
 * consumer picks it up automatically. A weekly health-check hook
 * (`/api/public/hooks/ai-models-health`) pings these IDs against the
 * configured brand keys and records failures in `ai_model_health`.
 */

export type ProviderName = "openai" | "anthropic" | "gemini";
export type ProviderRole = "strategic" | "operational" | "image";

export const MODEL_CATALOG: Record<ProviderName, Record<ProviderRole, string>> = {
  openai: {
    strategic: "gpt-5",
    operational: "gpt-5-mini",
    image: "gpt-image-1",
  },
  anthropic: {
    strategic: "claude-opus-4-1",
    operational: "claude-sonnet-4-5",
    image: "claude-sonnet-4-5", // Anthropic has no image model; falls back to text
  },
  gemini: {
    strategic: "gemini-2.5-pro",
    operational: "gemini-2.5-flash",
    image: "imagen-4.0-generate-001",
  },
};

/** Convenience default for legacy call sites. */
export const DEFAULT_TEXT_MODEL: Record<ProviderName, string> = {
  openai: MODEL_CATALOG.openai.operational,
  anthropic: MODEL_CATALOG.anthropic.operational,
  gemini: MODEL_CATALOG.gemini.operational,
};

export function getModel(provider: ProviderName, role: ProviderRole = "operational"): string {
  return MODEL_CATALOG[provider][role];
}