import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BrandRole } from "@/lib/team-admin.functions";

/** Papéis atribuíveis pela tela (o papel `client` vem do portal, não daqui). */
export const ASSIGNABLE_ROLES: BrandRole[] = ["owner", "manager", "user"];

export const ROLE_LABEL: Record<BrandRole, string> = {
  owner: "Admin (proprietário) — administra tudo na marca",
  manager: "Manager — administra a marca e todos os clientes",
  user: "User — opera apenas os clientes vinculados",
  client: "Cliente — somente portal",
};

export const ROLE_SHORT: Record<BrandRole, string> = {
  owner: "Admin",
  manager: "Manager",
  user: "User",
  client: "Cliente",
};

/** Resumo do acesso real concedido pelo papel (fonte: RBAC/RLS do banco). */
export const ROLE_ACCESS: Record<BrandRole, string> = {
  owner:
    "Visualiza, cria/edita e administra tudo na marca: equipe, identidade, clientes, SLA, conexões e portais.",
  manager:
    "Mesmo alcance operacional e administrativo da marca, em todos os clientes. Não altera owners/administradores.",
  user: "Opera conteúdo, projetos e tarefas apenas nos clientes de que é responsável ou aos quais está vinculado.",
  client: "Acesso restrito ao portal do próprio cliente.",
};

/** Escopo de clientes aplicado pelo banco (`can_access_client_row`). */
export const ROLE_SCOPE: Record<BrandRole, string> = {
  owner: "Todos os clientes da marca",
  manager: "Todos os clientes da marca",
  user: "Somente clientes vinculados",
  client: "Somente o próprio cliente (portal)",
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
  revoked: {
    label: "Revogado",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  expired: {
    label: "Expirado",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  },
};

export function StatusBadge({ status, label }: { status: StatusKind; label?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium", meta.className)}>
      {label ?? meta.label}
    </Badge>
  );
}

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
