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
 * Chaves de cache que NÃO dependem do workspace/cliente ativo: identidade do
 * usuário, lista de workspaces e flags globais. Trocar de workspace não pode
 * derrubá-las (isso forçava refetch de tudo e prolongava o boot).
 */
export const WORKSPACE_STABLE_QUERY_KEYS = new Set<string>([
  "brands",
  "dashboard-greeting",
  "me-is-super-admin",
  "portal-access",
]);

/** true quando a query depende do escopo (workspace/cliente) e deve ser descartada. */
export function isWorkspaceScopedQueryKey(queryKey: readonly unknown[] | undefined): boolean {
  const first = queryKey?.[0];
  if (typeof first !== "string") return true;
  return !WORKSPACE_STABLE_QUERY_KEYS.has(first);
}

/**
 * `SIGNED_IN` do Supabase também é emitido quando a sessão do MESMO usuário é
 * restaurada/renovada. Só é troca de identidade quando o usuário muda de fato
 * (ou quando houve logout).
 */
export function isIdentityChange(
  event: string,
  previousUserId: string | null,
  nextUserId: string | null,
): boolean {
  if (event === "SIGNED_OUT") return true;
  if (!nextUserId) return true;
  if (!previousUserId) return false;
  return previousUserId !== nextUserId;
}

/**
 * Troca de workspace/cliente: descarta o cache do escopo anterior em vez de
 * apenas invalidar (invalidação mantém os dados antigos na tela enquanto
 * revalida, o que exibia números de outro cliente por alguns instantes).
 */
export async function resetScopeCache(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.removeQueries({ predicate: (q) => isWorkspaceScopedQueryKey(q.queryKey) });
}
