import { redirect } from "@tanstack/react-router";
import { getCachedFeatureEnabled } from "./access-cache";

const BRAND_KEY = "nx.brand";

function readActiveBrandId(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(BRAND_KEY);
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/**
 * Bloqueia a navegação para um módulo quando a feature não está habilitada.
 * Uso em `beforeLoad` de rotas — roda client-side (subtree é `ssr: false`).
 */
export async function ensureFeatureEnabled(featureKey: string): Promise<void> {
  const brandId = readActiveBrandId();
  const enabled = await getCachedFeatureEnabled(brandId, featureKey);
  if (!enabled) {
    throw redirect({ to: "/dashboard", search: { blocked: featureKey } });
  }
}
