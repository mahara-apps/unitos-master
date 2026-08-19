import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BrandRole } from "@/lib/team-admin.functions";

/** Papéis atribuíveis pela tela (o papel `client` vem do portal, não daqui). */
export const ASSIGNABLE_ROLES: BrandRole[] = ["owner", "manager", "editor", "designer"];

export const ROLE_LABEL: Record<BrandRole, string> = {
  owner: "Owner — administra tudo na marca",
  manager: "Manager / Supervisor — administra equipe e operação",
  editor: "Editor / Agente — opera conteúdo e produção",
  designer: "Designer — opera produção criativa",
  client: "Cliente — somente portal",
};

export const ROLE_SHORT: Record<BrandRole, string> = {
  owner: "Owner",
  manager: "Manager",
  editor: "Editor",
  designer: "Designer",
  client: "Cliente",
};

/** Resumo do acesso real concedido pelo papel (fonte: RBAC/RLS do banco). */
export const ROLE_ACCESS: Record<BrandRole, string> = {
  owner: "Visualiza, cria/edita, aprova e administra tudo: equipe, identidade, clientes, IA e portais.",
  manager: "Visualiza, cria/edita e aprova em todos os clientes; administra equipe, SLA e auditoria. Não altera owners.",
  editor: "Visualiza, cria e edita conteúdo e produção apenas nos clientes vinculados.",
  designer: "Visualiza, cria e edita produção criativa apenas nos clientes vinculados.",
  client: "Acesso restrito ao portal do próprio cliente.",
};

export function memberInitials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  return (
    src
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

type StatusKind = "active" | "pending" | "inactive" | "revoked" | "expired";

const STATUS_META: Record<StatusKind, { label: string; className: string }> = {
  active: { label: "Ativo", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" },
  pending: { label: "Pendente", className: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  inactive: { label: "Inativo", className: "border-border bg-muted text-muted-foreground" },
  revoked: { label: "Revogado", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  expired: { label: "Expirado", className: "border-orange-500/30 bg-orange-500/10 text-orange-600" },
};

export function StatusBadge({ status, label }: { status: StatusKind; label?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium", meta.className)}>
      {label ?? meta.label}
    </Badge>
  );
}

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
