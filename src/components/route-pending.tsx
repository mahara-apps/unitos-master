import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback pintado imediatamente enquanto uma rota carrega.
 * Mantém o shell (sidebar/header) intacto e evita a sensação de "clique morto".
 */
export function RoutePending() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}