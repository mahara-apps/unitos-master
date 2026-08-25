import type { QueryClient } from "@tanstack/react-query";
import { clearCachedUser } from "@/lib/auth-cache";
import { clearAccessCaches } from "@/lib/access-cache";
import { markActiveWorkspaceUnresolved } from "@/lib/active-workspace";
import { clearSocialSnapshot } from "@/lib/query-persistence";

/**
 * Fase 7 — higiene de estado local em transições de identidade.
 *
 * O cache do React Query usa `keepPreviousData` globalmente (performance):
 * sem limpeza explícita, dados do usuário/escopo anterior continuam visíveis
 * durante o primeiro fetch da nova identidade. Nada de autorização depende
 * disto (servidor/RLS seguem sendo a autoridade) — é isolamento de UI.
 */
export function resetIdentityState(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
  clearCachedUser();
  clearAccessCaches();
  // O workspace volta a "indefinido": o feature gate aguarda a reconstrução do
  // contexto em vez de concluir que não existe workspace/plano.
  markActiveWorkspaceUnresolved();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("nx:identity-reset"));
    try {
      window.localStorage.removeItem("nx.brand");
      window.localStorage.removeItem("nx.client");
    } catch {
      /* storage indisponível — sem impacto funcional */
    }
    clearSocialSnapshot();
  }
}

/**
 * Troca de workspace/cliente: descarta o cache do escopo anterior em vez de
 * apenas invalidar (invalidação mantém os dados antigos na tela enquanto
 * revalida, o que exibia números de outro cliente por alguns instantes).
 */
export async function resetScopeCache(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (q) => {
      const first = q.queryKey?.[0];
      // Preserva apenas o que não é escopado (lista de workspaces e papel),
      // que são revalidados naturalmente pelas suas próprias chaves.
      return first !== "brands";
    },
  });
}
