import { redirect } from "@tanstack/react-router";
import { getCachedFeatureAccess, type FeatureAccessResult } from "./access-cache";
import { waitForActiveWorkspace } from "./active-workspace";

export type { FeatureAccessResult };

/**
 * Bloqueia a navegação para um módulo quando a feature não está habilitada.
 * Uso em `beforeLoad` de rotas — roda client-side (subtree é `ssr: false`).
 *
 * O workspace vem do contexto canônico (`active-workspace`, alimentado pelo
 * `ActiveContextProvider`), não de `localStorage`. Enquanto o contexto não
 * resolve, aguardamos: ausência de workspace NÃO é ausência de plano.
 */
export async function ensureFeatureEnabled(featureKey: string): Promise<void> {
  const { brandId } = await waitForActiveWorkspace();
  const result = await getCachedFeatureAccess(brandId, featureKey);
  if (result.enabled) return;
  // Falha de consulta não é bloqueio de plano: o servidor (RLS/guards) segue
  // sendo a autoridade de cada leitura/escrita dentro da tela.
  if (result.reason === "entitlement_error") return;
  throw redirect({
    to: "/dashboard",
    search: { blocked: featureKey, reason: result.reason },
  });
}
