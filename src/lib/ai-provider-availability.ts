import {
  isPrimaryTextProvider,
  PROVIDER_CAPABILITIES,
  type ProviderName,
} from "./ai-capabilities";

export type ProviderConnectionState = Record<
  string,
  { connected?: boolean } | null | undefined
>;

/** Ordem canônica das conexões de texto realmente utilizáveis. */
export function orderedUsableTextProviders(input: {
  primary?: string | null;
  fallback?: string | null;
  providers?: ProviderConnectionState | null;
  credentialProviders: Iterable<string>;
}): ProviderName[] {
  const credentials = new Set(input.credentialProviders);
  const configured = input.providers ?? {};
  // Não promove provedores conectados silenciosamente: a cadeia é sempre
  // principal válido + Groq configurado como fallback automático.
  const preferred = [isPrimaryTextProvider(input.primary) ? input.primary : null, "groq"];

  return preferred.filter(
    (provider, index, all): provider is ProviderName =>
      typeof provider === "string" &&
      all.indexOf(provider) === index &&
      provider in PROVIDER_CAPABILITIES &&
      PROVIDER_CAPABILITIES[provider as ProviderName].text &&
      (provider !== "groq" || input.fallback === "groq") &&
      configured[provider]?.connected === true &&
      credentials.has(provider),
  );
}
/**
 * Ordem das conexões utilizáveis para embeddings (memória/busca da IA).
 * Só OpenAI/Gemini geram embeddings; quando a principal de texto é outra
 * (ex.: Anthropic), usa as conexões válidas desses provedores, principal antes.
 */
export function orderedUsableEmbeddingProviders(input: {
  primary?: string | null;
  providers?: ProviderConnectionState | null;
  credentialProviders: Iterable<string>;
  allowed: readonly ProviderName[];
}): ProviderName[] {
  const credentials = new Set(input.credentialProviders);
  const configured = input.providers ?? {};
  const order = [
    ...(input.primary && (input.allowed as readonly string[]).includes(input.primary)
      ? [input.primary as ProviderName]
      : []),
    ...input.allowed,
  ];
  return order.filter(
    (provider, index, all) =>
      all.indexOf(provider) === index &&
      configured[provider]?.connected === true &&
      credentials.has(provider),
  );
}
