import { BarChart3, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/dashboard/sparkline";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
import { OverviewCard, OverviewEmpty, OverviewLink } from "./overview-shared";

export function OverviewPerformance({
  published,
  scheduled,
  pendingApprovals,
  totalApprovals,
  decidedApprovals,
  aiJobs,
  aiCost30d,
  costSpark,
  onOpenChannels,
}: {
  published: number;
  scheduled: number;
  pendingApprovals: number;
  totalApprovals: number;
  decidedApprovals: number;
  aiJobs: number;
  aiCost30d: number;
  costSpark: number[];
  onOpenChannels?: () => void;
}) {
  const hasData =
    published > 0 || scheduled > 0 || totalApprovals > 0 || aiJobs > 0 || aiCost30d > 0;
  const approvalPct = totalApprovals
    ? Math.round((decidedApprovals / totalApprovals) * 100)
    : 0;

  return (
    <OverviewCard
      title="Performance"
      subtitle="Últimos 30 dias"
      icon={<BarChart3 className="h-4 w-4" />}
      footer={hasData ? <OverviewLink label="Ver analytics" href="/analytics" /> : undefined}
    >
      {!hasData ? (
        <OverviewEmpty
          icon={<Plug className="h-4 w-4" />}
          title="Nenhum dado disponível no momento"
          hint="Conecte seus canais para acompanhar a performance."
          action={
            <Button size="sm" variant="outline" className="h-8" onClick={onOpenChannels}>
              Conectar canal
            </Button>
          }
        />
      ) : (
        <div className="flex h-full flex-col justify-between gap-4">
          <PageKpiGrid columns={2}>
            <PageKpi label="Publicações" value={published} />
            <PageKpi label="Agendadas" value={scheduled} />
            <PageKpi
              label="Aprovações pendentes"
              value={pendingApprovals}
              status={pendingApprovals > 0 ? "warning" : "neutral"}
              description={totalApprovals ? `${approvalPct}% resolvidas` : undefined}
            />
            <PageKpi label="Execuções de IA" value={aiJobs} />
          </PageKpiGrid>
          <div className="flex items-end justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Custo de IA · 30d
              </div>
              <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                ${aiCost30d.toFixed(2)}
              </div>
            </div>
            {costSpark.some((v) => v > 0) ? (
              <Sparkline
                data={costSpark.map((v) => Math.round(v * 1000))}
                className="h-8 w-24 text-primary"
              />
            ) : null}
          </div>
        </div>
      )}
    </OverviewCard>
  );
}
