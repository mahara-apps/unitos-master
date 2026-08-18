/**
 * Fase 1 RBAC — resolução canônica de papel/escopo compartilhada por
 * server functions. NÃO contém segredos: recebe o client Supabase do
 * chamador (autenticado, RLS aplicada) e apenas consulta as funções
 * canônicas do banco (`app_access_role`, `can_access_client`).
 *
 * Regra arquitetural: ROLE define autoridade, ESCOPO define onde.
 */

export type AuthorityRole = "super_admin" | "admin" | "manager" | "user" | "client";

export const AUTHORITY_ROLES: readonly AuthorityRole[] = [
  "super_admin",
  "admin",
  "manager",
  "user",
  "client",
];

/** Papéis com autoridade administrativa dentro da marca. */
export const ADMIN_LEVEL_ROLES: readonly AuthorityRole[] = ["super_admin", "admin", "manager"];

export const isAuthorityRole = (v: unknown): v is AuthorityRole =>
  typeof v === "string" && (AUTHORITY_ROLES as readonly string[]).includes(v);

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Papel canônico do usuário na marca (fonte única: brand_members + is_super_admin). */
export async function resolveAuthorityRole(
  supabase: RpcClient,
  userId: string,
  brandId?: string | null,
): Promise<AuthorityRole | null> {
  const { data, error } = await supabase.rpc("app_access_role", {
    _user_id: userId,
    _brand_id: brandId ?? null,
  });
  if (error) throw error;
  return isAuthorityRole(data) ? data : null;
}

/** Exige papel administrativo (ADMIN/MANAGER/SUPER ADMIN) na marca. */
export async function assertBrandAdmin(
  supabase: RpcClient,
  userId: string,
  brandId: string,
  opts: { allowManager?: boolean } = {},
): Promise<AuthorityRole> {
  const role = await resolveAuthorityRole(supabase, userId, brandId);
  const allowed: readonly AuthorityRole[] =
    opts.allowManager === false ? ["super_admin", "admin"] : ADMIN_LEVEL_ROLES;
  if (!role || !allowed.includes(role)) {
    throw new Error("Forbidden: papel insuficiente para esta operação");
  }
  return role;
}

/** Exige que o cliente esteja no escopo do usuário (mesma regra da RLS). */
export async function assertClientScope(
  supabase: RpcClient,
  userId: string,
  clientId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("can_access_client", {
    _client_id: clientId,
    _user_id: userId,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Forbidden: cliente fora do seu escopo");
}
