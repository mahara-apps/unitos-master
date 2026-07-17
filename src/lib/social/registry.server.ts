import { MetaProvider } from "./providers/meta.server";
import type { SocialProvider } from "./provider";
import type { SocialNetwork } from "./types";

/**
 * Registry of high-level Social Providers. Add a new implementation here to
 * expose it network-wide — the frontend keeps talking to the canonical
 * SocialProvider interface and never sees the network-specific API.
 */
const PROVIDERS: readonly SocialProvider[] = [new MetaProvider()];

export function listSocialProviders(): readonly SocialProvider[] {
  return PROVIDERS;
}

export function getSocialProviderForNetwork(
  network: SocialNetwork,
): SocialProvider | null {
  return (
    PROVIDERS.find((p) => (p.networks as readonly SocialNetwork[]).includes(network)) ?? null
  );
}

/** Matches the `provider` column of `social_connections` (e.g. "meta"). */
export function getSocialProviderByKey(key: string): SocialProvider | null {
  const label = key.toLowerCase();
  return PROVIDERS.find((p) => p.label.toLowerCase() === label) ?? null;
}