import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";

import {
  INSTALLATION_STATUS_LABEL,
  type InstallationStatus,
} from "@/lib/installation/manager-contract";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Tom visual por status da instalação — usado na lista e no detalhe. */
export const STATUS_TONE: Record<InstallationStatus, string> = {
  preparing: "border-border/60 text-muted-foreground",
  provisioning: "border-severity-info/40 text-severity-info",
  validating: "border-severity-info/40 text-severity-info",
  update_available: "border-severity-warning/40 text-severity-warning",
  up_to_date: "border-health-good/40 text-health-good",
  attention: "border-severity-warning/40 text-severity-warning",
  error: "border-destructive/40 text-destructive",
};

/** Etapas do ciclo de vida de uma instalação. */
export const LIFECYCLE = ["Cadastrar", "Provisionar", "Validar", "Configurar", "Pronto"] as const;

export function lifecycleIndex(i: {
  status: InstallationStatus;
  lastProvisionedAt: string | null;
  lastValidatedAt: string | null;
}): number {
  if (i.status === "up_to_date") return 4;
  if (i.lastValidatedAt) return 3;
  if (i.lastProvisionedAt) return 2;
  if (i.status === "provisioning" || i.status === "validating") return 1;
  return 0;
}

/** Trilha compacta: pontos + rótulo da etapa atual, sem repetir cinco cápsulas. */
export function LifecycleTrail({
  activeIndex,
  showLabel = true,
}: {
  activeIndex: number;
  showLabel?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {LIFECYCLE.map((label, index) => (
          <span
            key={label}
            title={label}
            className={cn(
              "h-1.5 rounded-full transition-all",
              index === activeIndex ? "w-5 bg-primary" : "w-1.5",
              index < activeIndex && "bg-health-good",
              index > activeIndex && "bg-border",
            )}
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-[11px] text-muted-foreground">
          {activeIndex >= LIFECYCLE.length - 1
            ? "Pronto"
            : `Etapa ${activeIndex + 1}/${LIFECYCLE.length} · ${LIFECYCLE[activeIndex]}`}
        </span>
      )}
    </div>
  );
}

/** Trilha completa em etapas — usada no topo da tela de detalhe. */
export function LifecycleSteps({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {LIFECYCLE.map((label, index) => (
        <li
          key={label}
          className={cn(
            "rounded-full border px-2 py-0.5",
            index < activeIndex && "border-health-good/40 text-health-good",
            index === activeIndex && "border-primary/50 bg-primary/10 text-primary",
            index > activeIndex && "border-border/60 text-muted-foreground",
          )}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

export function StatusBadge({ status }: { status: InstallationStatus }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[status])}>
      {INSTALLATION_STATUS_LABEL[status]}
    </Badge>
  );
}

export type VisualState = "ok" | "attention" | "error" | "pending" | "running";

const STATE_TONE: Record<VisualState, string> = {
  ok: "border-health-good/40 text-health-good",
  attention: "border-severity-warning/40 text-severity-warning",
  error: "border-destructive/40 text-destructive",
  pending: "border-border/60 text-muted-foreground",
  running: "border-severity-info/40 text-severity-info",
};

const STATE_ICON: Record<VisualState, ReactNode> = {
  ok: <CheckCircle2 className="h-3 w-3" />,
  attention: <AlertTriangle className="h-3 w-3" />,
  error: <XCircle className="h-3 w-3" />,
  pending: <CircleDashed className="h-3 w-3" />,
  running: <Loader2 className="h-3 w-3 animate-spin" />,
};

/** Etiqueta de estado com ícone — não depende só de cor. */
export function StateBadge({
  state,
  label,
  className,
}: {
  state: VisualState;
  label: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-[10px] font-medium", STATE_TONE[state], className)}
    >
      {STATE_ICON[state]}
      {label}
    </Badge>
  );
}

/** Par de versões: instalada × disponível, com veredito visual. */
export function VersionPair({
  installed,
  available,
  compact = false,
}: {
  installed: string | null;
  available: string;
  compact?: boolean;
}) {
  const upToDate = !!installed && installed === available;
  return (
    <div className={cn("flex items-center gap-2", compact ? "text-[11px]" : "text-xs")}>
      <span className="font-mono text-foreground">{installed ?? "—"}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-mono text-muted-foreground">{available}</span>
      <StateBadge
        state={upToDate ? "ok" : "attention"}
        label={upToDate ? "Em dia" : "Atualização disponível"}
      />
    </div>
  );
}

/** Célula de dado com rótulo em caixa alta pequena. */
export function DataCell({
  label,
  value,
  mono = false,
  children,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children ?? (
        <p className={cn("mt-0.5 truncate text-xs", mono && "font-mono")} title={value ?? "—"}>
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}

export function DataGrid({
  columns = 3,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}
