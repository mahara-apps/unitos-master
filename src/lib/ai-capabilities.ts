/**
 * Client-safe AI provider capabilities.
 * Kept out of `*.server.ts` so the UI and `*.functions.ts` can import it.
 */

export type ProviderName = "openai" | "anthropic" | "gemini" | "groq";
export type ProviderRole = "strategic" | "operational";
export type ProviderKind = "text";

/** Groq é reservado ao fallback; somente estes podem ser o principal de texto. */
export const PRIMARY_TEXT_PROVIDERS = ["openai", "anthropic", "gemini"] as const;
export type PrimaryTextProvider = (typeof PRIMARY_TEXT_PROVIDERS)[number];

export function isPrimaryTextProvider(
  provider: string | null | undefined,
): provider is PrimaryTextProvider {
  return PRIMARY_TEXT_PROVIDERS.some((candidate) => candidate === provider);
}

export const PROVIDER_CAPABILITIES: Record<ProviderName, { text: boolean }> = {
  openai: { text: true },
  anthropic: { text: true },
  gemini: { text: true },
  // Groq serve texto em alta velocidade; não gera imagem.
  groq: { text: true },
};

export const TEXT_PROVIDERS = (Object.keys(PROVIDER_CAPABILITIES) as ProviderName[]).filter(
  (p) => PROVIDER_CAPABILITIES[p].text,
);

export function supportsKind(provider: ProviderName, kind: ProviderKind): boolean {
  return PROVIDER_CAPABILITIES[provider]?.[kind] === true;
}
