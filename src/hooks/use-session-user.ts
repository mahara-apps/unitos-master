import { useQuery } from "@tanstack/react-query";
import { authUserQueryOptions } from "@/lib/auth-cache";

/**
 * Id do usuário da sessão atual — usado para isolar chaves de cache por
 * sessão (nenhuma tela pode reaproveitar dados de outra identidade).
 * Resolve do cache em memória do `auth-cache`, então não adiciona roundtrip.
 */
export function useSessionUserId(): string | null {
  const q = useQuery({ ...authUserQueryOptions(), retry: 0 });
  return q.data?.id ?? null;
}
