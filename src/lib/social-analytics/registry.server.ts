import type { SocialAnalyticsProvider } from "./provider";
import type { SocialNetwork } from "./types";
import { MetaAnalyticsProvider } from "./providers/meta.server";
import { makeNotImplementedProvider } from "./providers/stubs.server";

/**
 * Provider registry. Lookup is keyed by `SocialNetwork`. Unimplemented
 * networks fall back to a stub so the frontend can still list them uniformly.
 */
const meta = new MetaAnalyticsProvider();

const REGISTRY: Record<SocialNetwork, SocialAnalyticsProvider> = {
  facebook: meta,
  instagram: meta,
  linkedin: makeNotImplementedProvider("linkedin", "LinkedIn"),
  tiktok: makeNotImplementedProvider("tiktok", "TikTok"),
  youtube: makeNotImplementedProvider("youtube", "YouTube"),
  x: makeNotImplementedProvider("x", "X (Twitter)"),
  threads: makeNotImplementedProvider("threads", "Threads"),
};

export function getSocialProvider(network: SocialNetwork): SocialAnalyticsProvider {
  return REGISTRY[network];
}

export function listSocialProviders(): Array<{
  network: SocialNetwork;
  label: string;
  implemented: boolean;
}> {
  return (Object.keys(REGISTRY) as SocialNetwork[]).map((network) => {
    const p = REGISTRY[network];
    return {
      network,
      label: p.label,
      implemented: !(p.label === "LinkedIn" || p.label === "TikTok" || p.label === "YouTube" || p.label === "X (Twitter)" || p.label === "Threads"),
    };
  });
}
