import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  MoreHorizontal,
  LayoutGrid,
  List,
} from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import {
  ensureDefaultCrmPipelineFn,
  getCrmBoardFn,
  listCrmPipelinesFn,
} from "@/lib/crm.functions";
import { CrmBoard } from "@/components/crm/crm-board";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/pipelines")({
  head: () => ({
    meta: [
      { title: "Jornada · NexusFlow" },
      { name: "description", content: "Pipeline visual de negócios e jornada do cliente." },
    ],
  }),
  component: PipelinesRoute,
});

function PipelinesRoute() {
  const { brandId, clientId } = useActiveContext();
  const qc = useQueryClient();

  const listFn = useServerFn(listCrmPipelinesFn);
  const ensureFn = useServerFn(ensureDefaultCrmPipelineFn);
  const boardFn = useServerFn(getCrmBoardFn);

  const enabled = !!brandId && !!clientId;

  const pipelinesQ = useQuery({
    queryKey: ["crm-pipelines", brandId, clientId],
    queryFn: () => listFn({ data: { brandId: brandId!, clientId: clientId! } }),
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    if (pipelinesQ.isLoading) return;
    if ((pipelinesQ.data ?? []).length > 0) return;
    ensureFn({ data: { brandId: brandId!, clientId: clientId! } })
      .then(() => qc.invalidateQueries({ queryKey: ["crm-pipelines", brandId, clientId] }))
      .catch(() => {});
  }, [enabled, pipelinesQ.isLoading, pipelinesQ.data, brandId, clientId, ensureFn, qc]);

  const activePipeline = pipelinesQ.data?.[0];

  const boardQ = useQuery({
    queryKey: ["crm-board", activePipeline?.id],
    queryFn: () => boardFn({ data: { pipelineId: activePipeline!.id, brandId: brandId! } }),
    enabled: !!activePipeline?.id && !!brandId,
  });

  usePageHeader(
    {
      title: activePipeline?.name ?? "Jornada",
      subtitle: activePipeline?.description ?? "Funil visual de negócios",
      actions: <HeaderActions />,
    },
    [activePipeline?.id, activePipeline?.name, activePipeline?.description],
  );

  if (!brandId || !clientId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm rounded-xl border border-border/60 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Selecione um Workspace e uma Conta na barra lateral para visualizar a jornada.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <SubBar />
      <div className="flex min-h-0 flex-1 flex-col px-4">
        {boardQ.isLoading || !boardQ.data ? (
          <BoardSkeleton />
        ) : (
          <CrmBoard board={boardQ.data} brandId={brandId} clientId={clientId} />
        )}
      </div>
    </div>
  );
}

function HeaderActions() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center rounded-md border border-border/60 bg-background p-0.5">
        <button className="rounded p-1 text-foreground" aria-label="Kanban">
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Lista">
          <List className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar" className="h-8 w-52 pl-7 text-xs" />
      </div>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
      </Button>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
        <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SubBar() {
  const [sort, setSort] = useState("Mais recentes");
  const [range, setRange] = useState("Último ano");
  return (
    <div className="flex items-center gap-2 px-4 pb-3 pt-1">
      <FilterPill label="Ordenação" value={sort} onChange={setSort} options={["Mais recentes", "Maior valor", "A-Z"]} />
      <FilterPill label="Intervalo" value={range} onChange={setRange} options={["Últimos 7 dias", "Últimos 30 dias", "Último ano", "Sempre"]} />
    </div>
  );
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <span className="opacity-70">{label}:</span>
        <span className="font-medium text-foreground/90">{value}</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md">
          {options.map((o) => (
            <button
              key={o}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
              }}
              className={`block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted ${
                o === value ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-1 gap-4 p-[5px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex h-full w-[300px] shrink-0 flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}