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

export function normalizePermissions(input: unknown): PermissionId[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<PermissionId>(ALL_PERMISSION_IDS);
  return input.filter((v): v is PermissionId => typeof v === "string" && valid.has(v as PermissionId));
}