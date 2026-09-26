import {
  PROVIDER_CAPABILITIES,
  TEXT_PROVIDERS,
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
  const preferred = [input.primary, input.fallback, ...TEXT_PROVIDERS];

  return preferred.filter(
    (provider, index, all): provider is ProviderName =>
      typeof provider === "string" &&
      all.indexOf(provider) === index &&
      provider in PROVIDER_CAPABILITIES &&
      PROVIDER_CAPABILITIES[provider as ProviderName].text &&
      configured[provider]?.connected === true &&
      credentials.has(provider),
  );
}