import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyBrands } from "@/lib/workspace.functions";

/** Nome da marca/ambiente ativo — reaproveita o cache do switcher (`["brands"]`). */
export function useBrandName(brandId: string | null | undefined): string | null {
  const list = useServerFn(listMyBrands);
  const q = useQuery({
    queryKey: ["brands"],
    queryFn: () => list(),
    staleTime: 5 * 60_000,
  });
  if (!brandId) return null;
  const found = (q.data ?? []).find((b) => b.id === brandId);
  return found?.name ?? null;
}
