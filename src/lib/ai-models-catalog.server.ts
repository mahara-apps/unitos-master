/**
 * Central catalog of AI model IDs per provider.
 * Single source of truth to avoid deprecated-model errors.
 *
 * Defaults below are the compiled fallback. When a provider deprecates a
 * model, the health check (`/api/public/hooks/ai-models-health`) discovers the
 * successor, stores it in `ai_model_catalog_overrides` and notifies the super
 * admins — every consumer then resolves the new ID with no deploy.
 */

import {
  PROVIDER_CAPABILITIES,
  type ProviderKind,
  type ProviderName,
  type ProviderRole,
} from "./ai-capabilities";

export type { ProviderName, ProviderRole, ProviderKind };
export { PROVIDER_CAPABILITIES };

export const MODEL_CATALOG: Record<
  ProviderName,
  Record<ProviderRole, string | null>
> = {
  openai: {
    strategic: "gpt-5",
    operational: "gpt-5-mini",
    image: "gpt-image-1",
  },
  anthropic: {
    strategic: "claude-opus-4-1",
    operational: "claude-sonnet-4-5",
    image: null, // Anthropic não gera imagem
  },
  gemini: {
    strategic: "gemini-2.5-pro",
    operational: "gemini-2.5-flash",
    image: "imagen-4.0-generate-001",
  },
};

/** Convenience default for legacy call sites. */
export const DEFAULT_TEXT_MODEL: Record<ProviderName, string> = {
  openai: MODEL_CATALOG.openai.operational!,
  anthropic: MODEL_CATALOG.anthropic.operational!,
  gemini: MODEL_CATALOG.gemini.operational!,
};

/** Compiled default (sem overrides). */
export function getModel(
  provider: ProviderName,
  role: ProviderRole = "operational",
): string | null {
  return MODEL_CATALOG[provider][role];
}

/* ------------------------------------------------------------------ */
/* Overrides gravados pelo health check                                */
/* ------------------------------------------------------------------ */

export type CatalogOverride = {
  provider: ProviderName;
  role: ProviderRole;
  modelId: string;
  replacedModelId: string | null;
  reason: string | null;
  updatedAt: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; rows: CatalogOverride[] } | null = null;

export function invalidateCatalogCache() {
  cache = null;
}

export async function loadCatalogOverrides(): Promise<CatalogOverride[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_model_catalog_overrides")
      .select("provider, role, model_id, replaced_model_id, reason, updated_at");
    const rows: CatalogOverride[] = (data ?? []).map((r) => ({
      provider: r.provider as ProviderName,
      role: r.role as ProviderRole,
      modelId: r.model_id as string,
      replacedModelId: (r.replaced_model_id as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      updatedAt: r.updated_at as string,
    }));
    cache = { at: Date.now(), rows };
    return rows;
  } catch (err) {
    console.error("[ai-models-catalog] falha ao carregar overrides", err);
    return cache?.rows ?? [];
  }
}

/**
 * Resolve o modelo em uso: override do banco quando existir, senão o default
 * compilado. Retorna null quando o provedor não suporta o papel (ex.: imagem
 * na Anthropic).
 */
export async function resolveModel(
  provider: ProviderName,
  role: ProviderRole = "operational",
): Promise<string | null> {
  const fallback = MODEL_CATALOG[provider][role];
  if (role === "image" && !PROVIDER_CAPABILITIES[provider].image) return null;
  const overrides = await loadCatalogOverrides();
  const hit = overrides.find((o) => o.provider === provider && o.role === role);
  return hit?.modelId ?? fallback;
}
