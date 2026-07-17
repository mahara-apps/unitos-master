import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

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
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Fire the intent-based preload as soon as the pointer enters a Link
    // (or a link gains focus). Combined with staleTime above, hovered
    // routes are usually ready before the click completes.
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 100,
    defaultPendingMinMs: 150,
  });

  return router;
};
