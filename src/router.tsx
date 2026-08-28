import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RoutePending } from "./components/route-pending";
import { RouteError } from "./components/route-error";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Warm caches stay fresh for 30s so that route navigation reuses
        // prefetched/preloaded data instead of refetching on mount.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
        // NÃO usar `keepPreviousData` como default: a chave de cada query carrega
        // `userId + brandId + clientId`, e manter os dados anteriores fazia o
        // Cliente X continuar renderizado sob o Cliente Y durante a troca.
        // Telas que realmente precisam (paginação/intervalo) optam localmente.

      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 0,
    // Mostra o skeleton logo após ~80ms para navegações que ainda estão
    // carregando dados — evita a sensação de "clique morto" na sidebar.
    defaultPendingMs: 80,
    defaultPendingMinMs: 200,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
  });

  return router;
};
