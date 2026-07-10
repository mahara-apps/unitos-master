import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Users, ListChecks, CalendarClock, ShieldCheck, TrendingUp, TrendingDown } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  getAgencyDashboard,
  getDashboardStats,
  type AgencyDashboard,
} from "@/lib/dashboard.functions";
import { Sparkline } from "@/components/dashboard/sparkline";
import { HealthBar } from "@/components/dashboard/health-bar";
import { PublicationHeatmap } from "@/components/dashboard/heatmap";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { usePageHeader } from "@/hooks/use-page-header";
import { cn } from "@/lib/utils";
import { CustomerDashboard } from "@/components/customer/customer-dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { brandId, clientId } = useActiveContext();

  const [range, setRange] = React.useState<DateRange | undefined>(() => ({
    from: subDays(new Date(), 29),
    to: new Date(),
  }));

  const days = React.useMemo(() => {
    if (!range?.from) return 30;
    const end = range.to ?? range.from;
    return Math.max(7, Math.min(90, differenceInCalendarDays(end, range.from) + 1));
  }, [range]);

  usePageHeader(
    {
      title: "Painel",
      subtitle: clientId ? "Modo cliente" : "Visão geral da agência",
      actions: <DateRangePicker value={range} onChange={setRange} />,
    },
    [range, clientId],
  );

  const agency = useQuery({
    queryKey: ["agency-dashboard", brandId],
    enabled: !!brandId && !clientId,
    queryFn: () => getAgencyDashboard({ data: { brandId: brandId! } }),
  });

  const client = useQuery({
    queryKey: ["dashboard", brandId, clientId],
    enabled: !!brandId && !!clientId,
    queryFn: () => getDashboardStats({ data: { brandId: brandId!, clientId } }),
  });

  if (!brandId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Selecione uma workspace no menu lateral para carregar o painel.
      </div>
    );
  }

  // When an account is selected globally, the dashboard becomes the
  // customer-scoped control center (same view as the Overview tab in
  // /customers/$customerId).
  if (clientId) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <CustomerDashboard brandId={brandId} clientId={clientId} />
      </div>
    );
  }

  const data: AgencyDashboard | undefined = clientId
    ? client.data
      ? {
          counts: client.data.counts,
          sparkline: client.data.sparkline,
          alerts: [],
          healths: [],
          approvalsQueue: [],
          upcoming: [],
          heatmap: Array.from({ length: 60 }, () => 0),
        }
      : undefined
    : agency.data;

  const isLoading = clientId ? client.isLoading : agency.isLoading;
  const c = data?.counts;
  const spark = data?.sparkline ?? [];
  const heatmap = (data?.heatmap ?? []).slice(-days);

  const doneRatio = c
    ? Math.round(
        (c.tasks_done_7d /
          Math.max(1, c.tasks_done_7d + c.tasks_open)) *
          100,
      )
    : 0;
  const approvalRatio = c
    ? Math.round(
        ((c.posts_total - c.approvals_pending) / Math.max(1, c.posts_total)) * 100,
      )
    : 100;

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* KPI ROW */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Clientes ativos"
          value={isLoading ? "…" : (c?.clients ?? 0)}
          spark={spark}
          trendDelta={deltaFromSpark(spark)}
          accent="var(--color-primary)"
        />
        <MetricCard
          icon={<ListChecks className="h-3.5 w-3.5" />}
          label="Tarefas abertas"
          value={isLoading ? "…" : (c?.tasks_open ?? 0)}
          hint={`${c?.tasks_overdue ?? 0} atrasadas · ${c?.tasks_done_7d ?? 0} concluídas 7d`}
          spark={spark}
          accent="var(--color-severity-warning, oklch(0.72 0.16 65))"
          footer={
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Conclusão 7d</span>
                <span className="text-foreground/80">{doneRatio}%</span>
              </div>
              <HealthBar score={doneRatio} />
            </div>
          }
        />
        <MetricCard
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Aprovações pendentes"
          value={isLoading ? "…" : (c?.approvals_pending ?? 0)}
          hint={`${c?.posts_total ?? 0} peças no pipeline`}
          spark={spark}
          accent="var(--color-severity-info, oklch(0.7 0.14 240))"
          footer={
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Fluxo aprovado</span>
                <span className="text-foreground/80">{approvalRatio}%</span>
              </div>
              <HealthBar score={approvalRatio} />
            </div>
          }
        />
        <MetricCard
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label="Projetos ativos"
          value={isLoading ? "…" : (c?.projects_active ?? 0)}
          hint="Em execução no ciclo atual"
          spark={spark}
          accent="oklch(0.78 0.16 155)"
        />
      </div>

      {/* WOW GRID */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent" />
          <header className="relative flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Ritmo editorial
              </h2>
              <p className="text-xs text-muted-foreground">
                Frequência de publicações agregadas nos últimos {days} dias.
              </p>
            </div>
            <HeatmapLegend />
          </header>
          <div className="relative flex min-h-[220px] items-center justify-center overflow-x-auto px-5 py-6">
            {isLoading ? (
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted/40" />
            ) : (
              <PublicationHeatmap data={heatmap.length ? heatmap : Array.from({ length: days }, () => 0)} />
            )}
          </div>
          <div className="relative grid grid-cols-3 gap-4 border-t border-border/50 px-5 py-3 text-xs">
            <FootStat label="Total no período" value={heatmap.reduce((a, b) => a + b, 0)} />
            <FootStat label="Pico diário" value={Math.max(0, ...heatmap)} />
            <FootStat
              label="Média/dia"
              value={heatmap.length ? (heatmap.reduce((a, b) => a + b, 0) / heatmap.length).toFixed(1) : 0}
            />
          </div>
        </section>

        <InsightsPanel brandId={brandId} clientId={clientId} />
      </div>

      {/* HEALTH + ALERTS (agency mode only) */}
      {!clientId && data && (data.healths.length > 0 || data.alerts.length > 0) && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-border/60 bg-card">
            <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Saúde dos clientes</h2>
                <p className="text-xs text-muted-foreground">Score composto: entregas, aprovações, briefing e agenda.</p>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {data.healths.length} contas
              </span>
            </header>
            <ul className="divide-y divide-border/40">
              {data.healths.slice(0, 6).map((h) => (
                <li key={h.id} className="grid grid-cols-[1fr_100px_60px] items-center gap-4 px-5 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: h.color ?? "var(--color-primary)" }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{h.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {h.openTasks} tarefas · {h.overdueTasks} atrasadas · {h.approvalsPending} p/ aprovar
                      </div>
                    </div>
                  </div>
                  <HealthBar score={h.score} />
                  <span className="text-right font-mono text-xs tabular-nums text-foreground/80">
                    {h.score}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card">
            <header className="border-b border-border/50 px-5 py-4">
              <h2 className="text-sm font-semibold tracking-tight">Fila de aprovações</h2>
              <p className="text-xs text-muted-foreground">Peças aguardando validação.</p>
            </header>
            {data.approvalsQueue.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                Nada pendente. Fluxo em dia.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {data.approvalsQueue.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {a.client_name}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                      {timeAgo(a.waiting_since)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  spark,
  accent,
  trendDelta,
  footer,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  spark?: number[];
  accent?: string;
  trendDelta?: number;
  footer?: React.ReactNode;
}) {
  const trendPositive = (trendDelta ?? 0) >= 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 transition hover:border-border">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-40 blur-2xl"
        style={{ background: accent }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-md border border-border/60 bg-background/60 text-foreground/70">
            {icon}
          </span>
          {label}
        </div>
        {typeof trendDelta === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              trendPositive
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-rose-500/30 bg-rose-500/10 text-rose-500",
            )}
          >
            {trendPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trendPositive ? "+" : ""}
            {trendDelta}%
          </span>
        )}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        {spark && spark.length > 0 && (
          <Sparkline data={spark} className="h-8 w-24" color={accent ?? "hsl(var(--primary))"} />
        )}
      </div>
      {hint && <div className="relative mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      {footer && <div className="relative">{footer}</div>}
    </div>
  );
}

function FootStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="hidden items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground sm:flex">
      Menos
      {[0.15, 0.35, 0.55, 0.75, 0.95].map((o) => (
        <span
          key={o}
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{ background: `color-mix(in oklch, var(--color-primary) ${o * 100}%, transparent)` }}
        />
      ))}
      Mais
    </div>
  );
}

function deltaFromSpark(data: number[]): number {
  if (data.length < 2) return 0;
  const half = Math.floor(data.length / 2);
  const prev = data.slice(0, half).reduce((a, b) => a + b, 0) || 1;
  const curr = data.slice(half).reduce((a, b) => a + b, 0);
  return Math.round(((curr - prev) / prev) * 100);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}