export type PermissionId =
  | "admin.full"
  | "pipelines.admin"
  | "pipelines.member"
  | "automations.manage"
  | "automations.logs"
  | "ai.edit"
  | "ai.analytics";

export const PERMISSION_GROUPS: Array<{
  id: string;
  label: string;
  description: string;
  kind: "radio" | "checkbox";
  items: Array<{ id: PermissionId; label: string; description: string }>;
}> = [
  {
    id: "admin",
    label: "Admin",
    description: "Acesso total, sem restrições.",
    kind: "radio",
    items: [
      { id: "admin.full", label: "Admin completo", description: "Concede acesso irrestrito a toda a marca." },
    ],
  },
  {
    id: "pipelines",
    label: "Pipelines",
    description: "Gestão do fluxo de conteúdo.",
    kind: "checkbox",
    items: [
      { id: "pipelines.admin", label: "Pipeline Admin", description: "Cria, edita e arquiva pipelines." },
      { id: "pipelines.member", label: "Pipeline Member", description: "Opera cards e comenta." },
    ],
  },
  {
    id: "automations",
    label: "Automations",
    description: "Workflows e logs de execução.",
    kind: "checkbox",
    items: [
      { id: "automations.manage", label: "Manage Workflows", description: "Cria e edita automações." },
      { id: "automations.logs", label: "View Logs", description: "Consulta histórico de execuções." },
    ],
  },
  {
    id: "ai",
    label: "IA Agents",
    description: "Configuração dos agentes.",
    kind: "checkbox",
    items: [
      { id: "ai.edit", label: "Edit Prompts/Models", description: "Ajusta prompts e provedores." },
      { id: "ai.analytics", label: "View AI Analytics", description: "Ver consumo e custo dos agentes." },
    ],
  },
];

export const ALL_PERMISSION_IDS: PermissionId[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/**
 * Permissões padrão aplicadas automaticamente quando um papel é escolhido
 * sem personalização manual. O usuário pode sobrescrever expandindo a
 * seção "Personalizar permissões" no fluxo de convite.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<
  "owner" | "manager" | "editor" | "designer",
  PermissionId[]
> = {
  owner: ["admin.full"],
  manager: [
    "pipelines.admin",
    "automations.manage",
    "automations.logs",
    "ai.edit",
    "ai.analytics",
  ],
  editor: ["pipelines.member", "automations.logs"],
  designer: ["pipelines.member"],
};

export function normalizePermissions(input: unknown): PermissionId[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<PermissionId>(ALL_PERMISSION_IDS);
  return input.filter((v): v is PermissionId => typeof v === "string" && valid.has(v as PermissionId));
}

/* ------------------------------------------------------------------ */
/* Access-Role Matrix (agency-wide RBAC)                              */
/* ------------------------------------------------------------------ */

/** Nível de acesso efetivo — derivado do papel do usuário na brand. */
export type AccessRole = "admin" | "user";

/**
 * Mapeia o papel bruto (brand_members.role: owner|manager|editor|designer|client)
 * para o nível de acesso global usado pela UI/rotas.
 * - owner/manager → admin (acesso irrestrito)
 * - demais       → user  (colaborador escopado)
 */
export function resolveAccessRole(brandRole: string | null | undefined): AccessRole {
  const r = (brandRole ?? "").toLowerCase();
  return r === "owner" || r === "manager" || r === "admin" ? "admin" : "user";
}

export const isAdminRole = (role: AccessRole | null | undefined) => role === "admin";

/** URLs permitidas na sidebar por nível de acesso. */
export const SIDEBAR_ALLOWED_URLS: Record<AccessRole, ReadonlySet<string>> = {
  admin: new Set([
    "/dashboard", "/tasks", "/calendar", "/projects", "/customers",
    "/analytics", "/media-plans",
    "/connections", "/agents",
    "/content", "/monthly-plan", "/brain", "/chat",
    "/settings/team", "/notifications",
    "/settings",
  ]),
  user: new Set([
    "/dashboard", "/tasks", "/calendar", "/projects", "/customers",
    "/content", "/monthly-plan", "/media-plans", "/brain", "/chat",
    "/notifications",
  ]),
};

export const canAccessSidebarUrl = (role: AccessRole, url: string) =>
  SIDEBAR_ALLOWED_URLS[role].has(url);

/**
 * Verifica se um usuário tem uma permissão granular. Super admins (flag
 * `is_super_admin` no perfil) recebem `true` imediatamente, sem consultar
 * `brand_members.permissions`.
 *
 * Uso client-side apenas para gating cosmético — o bloqueio real fica nas
 * RLS/server functions. Passe `isSuperAdmin` como resolvido pela query
 * `useIsSuperAdmin` (evita callback assíncrono no helper).
 */
export function hasPermission(
  isSuperAdmin: boolean,
  grantedPermissions: readonly string[] | null | undefined,
  permissionId: PermissionId,
): boolean {
  if (isSuperAdmin) return true;
  if (!grantedPermissions) return false;
  if (grantedPermissions.includes("admin.full")) return true;
  return grantedPermissions.includes(permissionId);
}

/** Dados básicos do cliente — apenas admin edita. */
export const canEditBasicInfo = (role: AccessRole) => role === "admin";

/** Rota de fallback quando o usuário tenta acessar um cliente/rota fora do escopo. */
export const FALLBACK_ROUTE: Record<AccessRole, string> = {
  admin: "/dashboard",
  user: "/dashboard",
};