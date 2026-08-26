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
  // Quando o workspace já é conhecido, a consulta de entitlement começa em
  // paralelo com a espera pela resolução do contexto (antes eram seriais). O
  // resultado só é aproveitado se o workspace resolvido for o mesmo — nenhuma
  // autorização é assumida por antecipação.
  const optimisticBrandId = getActiveWorkspace().brandId;
  const optimistic = optimisticBrandId
    ? getCachedFeatureAccess(optimisticBrandId, featureKey)
    : null;
  const { brandId } = await waitForActiveWorkspace();
  const result =
    optimistic && brandId && brandId === optimisticBrandId
      ? await optimistic
      : await getCachedFeatureAccess(brandId, featureKey);
  if (result.enabled) return;
  // Falha de consulta não é bloqueio de plano: o servidor (RLS/guards) segue
  // sendo a autoridade de cada leitura/escrita dentro da tela.
  if (result.reason === "entitlement_error") return;
  throw redirect({
    to: "/dashboard",
    search: { blocked: featureKey, reason: result.reason },
  });
}
