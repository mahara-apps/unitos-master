/**
 * Cabeçalho do projeto — identidade e controles exclusivos do projeto.
 * Métricas editoriais pertencem ao contexto de Pautas, não a este cabeçalho.
 */
import type { ReactNode } from "react";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";

export function ProjectHeader({
  name,
  color,
  clientName,
  clientNode,
  assignee,
  status,
  planBadge,
  actions,
}: {
  name: string;
  color: string;
  clientName: string;
  clientNode?: ReactNode;
  assignee?: ReactNode;
  status?: ReactNode;
  planBadge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <DashboardPanelSurface>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="h-8 w-1.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold leading-tight sm:text-2xl">{name}</h2>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono uppercase tracking-widest">Cliente</span>
              {clientNode ?? <span className="truncate">{clientName}</span>}
            </div>
          </div>
        </div>
        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-auto sm:ml-auto sm:justify-end">
          {planBadge}
          {assignee}
          {status}
          {actions}
        </div>
      </div>
    </DashboardPanelSurface>
  );
}
