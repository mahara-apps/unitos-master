import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccessFn } from "@/lib/access.functions";
import { useActiveContext } from "@/hooks/use-active-context";
import { type AccessRole } from "@/lib/permissions";
import type { AuthorityRole } from "@/lib/access-guard";

type Result = {
  /** Nível legado usado pela UI atual (admin = admin|manager|super_admin). */
  role: AccessRole;
  /** Papel canônico — MANAGER é explícito e não se funde com ADMIN. */
  authorityRole: AuthorityRole | null;
  brandRole: string | null;
  userId: string | null;
  /** IDs de clientes que o usuário pode ver/selecionar (null = todos). */
  allowedClientIds: Set<string> | null;
  isReady: boolean;
};

/**
 * Fonte única de papel/escopo no frontend — espelha `public.my_access`
 * (mesma regra da RLS). Gating de UI apenas; autorização real fica no banco
 * e nas server functions.
 */
export function useAccessRole(): Result {
  const { brandId } = useActiveContext();
  const fetchAccess = useServerFn(getMyAccessFn);

  const q = useQuery({
    queryKey: ["my-access", brandId],
    queryFn: () => fetchAccess({ data: { brandId } }),
    staleTime: 60_000,
  });

  return useMemo<Result>(() => {
    const a = q.data;
    const authorityRole = a?.role ?? null;
    const isAdminLevel =
      authorityRole === "super_admin" || authorityRole === "admin" || authorityRole === "manager";
    return {
      role: isAdminLevel ? "admin" : "user",
      authorityRole,
      // Admin global (`user_profiles.role='admin'`) pode não ter linha em
      // brand_members — a UI o trata como owner da marca (autoridade
      // equivalente), sem virar super admin.
      brandRole: a?.isSuperAdmin
        ? "super_admin"
        : (a?.brandRole ?? (authorityRole === "admin" ? "owner" : null)),
      userId: a?.userId ?? null,
      // Admin/manager/super admin: escopo total na marca. Operação: lista explícita.
      allowedClientIds: !a ? null : isAdminLevel ? null : new Set(a.clientIds),
      isReady: !q.isLoading && !!a,
    };
  }, [q.data, q.isLoading]);
}
