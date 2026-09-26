import { ArrowRight, Globe, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

import {
  INSTALLATION_HEALTH_LABEL,
  type InstallationHealth,
} from "@/lib/installation/manager-contract";
import type { InstallationRecord } from "@/lib/installation/manager.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeBr } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import {
  LifecycleTrail,
  StateBadge,
  StatusBadge,
  VersionPair,
  lifecycleIndex,
  type VisualState,
} from "./installation-visuals";

const HEALTH_STATE: Record<InstallationHealth, VisualState> = {
  unknown: "pending",
  healthy: "ok",
  degraded: "attention",
  failing: "error",
};

export function InstallationCard({
  installation,
  selection,
}: {
  installation: InstallationRecord;
  selection?: { checked: boolean; onChange: (checked: boolean) => void; disabled: boolean };
}) {
  const i = installation;
  return (
    <div className="relative min-w-0">
      {selection && (
        <label className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded bg-background px-1 py-0.5 text-xs font-medium" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" checked={selection.checked} disabled={selection.disabled} onChange={(event) => selection.onChange(event.target.checked)} aria-label={`Selecionar ${i.name} para atualização`} className="accent-primary" />
          Selecionar
        </label>
      )}
    <Link
      to="/admin/instalacoes/$id"
      params={{ id: i.id }}
      aria-label={`Abrir instalação ${i.name}`}
      className={cn(
        "block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Card className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm">
        <CardContent className={cn("space-y-3 p-4", selection && "pt-12")}>
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{i.name}</h3>
              {/* "Atualizada"/"Atualização disponível" já é dito pelo bloco de
                  versão abaixo — aqui só entram estados que ele não cobre. */}
              {i.status !== "up_to_date" && i.status !== "update_available" && (
                <StatusBadge status={i.status} />
              )}
              <StateBadge
                state={HEALTH_STATE[i.health]}
                label={INSTALLATION_HEALTH_LABEL[i.health]}
              />
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{i.domain ?? "domínio não informado"}</span>
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="pointer-events-none shrink-0">
            <span>
            Abrir <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </span>
          </Button>
        </header>

        {/* Versão instalada = release do código realmente publicado (pinned). */}
        <VersionPair
          installed={i.pinnedRelease ?? i.currentVersion}
          available={i.availableVersion}
        />

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
          <LifecycleTrail activeIndex={lifecycleIndex(i)} complete={i.status === "up_to_date"} />
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {i.lastValidatedAt
              ? `validada em ${formatDateTimeBr(i.lastValidatedAt)}`
              : "nunca validada"}
          </span>
        </footer>
        </CardContent>
      </Card>
    </Link>
    </div>
  );
}
