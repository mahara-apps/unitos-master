import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listClients, listMyBrands } from "@/lib/workspace.functions";
import { useActiveContext } from "@/hooks/use-active-context";
import { resolveAccessRole, type AccessRole } from "@/lib/permissions";
import { useIsSuperAdmin } from "@/hooks/use-feature-access";

type Result = {
  role: AccessRole;
  brandRole: string | null;
  userId: string | null;
  /** IDs de clientes que o usuário pode ver/selecionar (null = todos). */
  allowedClientIds: Set<string> | null;
  isReady: boolean;
};

/**
 * Resolve o nível de acesso (admin/user) na brand ativa e a lista de
 * clientes visíveis. Para 'user', restringe a clientes onde ele é o
 * `owner_user_id` (agente responsável).
 */
export function useAccessRole(): Result {
  const { brandId } = useActiveContext();
  const [userId, setUserId] = useState<string | null>(null);
  const superQ = useIsSuperAdmin();
  const isSuper = !!superQ.data?.isSuperAdmin;

  const listBrands = useServerFn(listMyBrands);
  const listCl = useServerFn(listClients);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const brandsQ = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 60_000,
  });
  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => listCl({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });

  return useMemo<Result>(() => {
    if (isSuper) {
      return {
        role: "admin",
        brandRole: "super_admin",
        userId,
        allowedClientIds: null,
        isReady: userId !== null && !superQ.isLoading,
      };
    }
    const brandRole = brandsQ.data?.find((b) => b.id === brandId)?.role ?? null;
    const role = resolveAccessRole(brandRole);
    let allowed: Set<string> | null = null;
    if (role === "user" && clientsQ.data && userId) {
      allowed = new Set(
        clientsQ.data
          .filter((c) => (c as { owner_user_id?: string | null }).owner_user_id === userId)
          .map((c) => c.id),
      );
    }
    return {
      role,
      brandRole,
      userId,
      allowedClientIds: allowed,
      isReady: !brandsQ.isLoading && (!brandId || !clientsQ.isLoading) && userId !== null,
    };
  }, [brandsQ.data, brandsQ.isLoading, clientsQ.data, clientsQ.isLoading, brandId, userId, isSuper, superQ.isLoading]);
}