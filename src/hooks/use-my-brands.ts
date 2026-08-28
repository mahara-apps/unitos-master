import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyBrands } from "@/lib/workspace.functions";

export type MyBrand = Awaited<ReturnType<typeof listMyBrands>>[number];

/**
 * Fonte única da lista de workspaces do usuário.
 *
 * Compartilhada pelo resolvedor de contexto e pelo seletor da sidebar: se cada
 * um tivesse sua própria query, o contexto podia ficar "resolvendo" para
 * sempre enquanto a UI já tinha os dados.
 *
 * `retry` mais alto de propósito: logo após o login o token pode ainda não
 * estar anexado à server function, e a primeira chamada falha de forma
 * transitória — sem retry esse 401 congelava o boot até uma navegação.
 */
export function useMyBrandsQuery(): UseQueryResult<MyBrand[], Error> {
  const list = useServerFn(listMyBrands);
  return useQuery({
    queryKey: ["brands"],
    queryFn: () => list(),
    staleTime: 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 3_000),
  });
}
