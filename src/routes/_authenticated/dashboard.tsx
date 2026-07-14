import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Gauge,
  Info,
  Instagram,
  Layers,
  Linkedin,
  Mail,
  Music2,
  Phone,
  Plus,
  Radar,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Youtube,
  Zap,
} from "lucide-react";

import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  getAgencyDashboardFn,
  getDashboardStats,
  type AgencyDashboard,
  type AiUsageSummary,
  type ClientHealth,
  type DashboardStats,
} from "@/lib/dashboard.functions";
import {
  createPortalTokenFn,
  loadCustomerDashboardFn,
} from "@/lib/customer-dashboard.functions";
import { Sparkline } from "@/components/dashboard/sparkline";
import { HealthBar } from "@/components/dashboard/health-bar";
import { PanelCard as Card } from "@/components/ui/panel-card";
import { PanelEmptyState as EmptyState } from "@/components/ui/panel-empty";
import { PanelSkeletonList as SkeletonList } from "@/components/ui/panel-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { brandId, clientId } = useActiveContext();
  if (!brandId) {
    return (
      <div className="w-full px-6 py-10">
        <div className="rounded-2xl border border-border/60 bg-card px-6 py-8 text-sm text-muted-foreground">
          Selecione uma workspace na barra lateral para carregar o painel.
        </div>
      </div>
    );
  }
  return clientId ? (
    <ClientMode brandId={brandId} clientId={clientId} />
  ) : (
    <AgencyMode brandId={brandId} />
  );
}

// ============================================================================
// AGENCY MODE
// ============================================================================

function AgencyMode({ brandId }: { brandId: string }) {
  const fn = useServerFn(getAgencyDashboardFn);
  const [greeting, setGreeting] = React.useState("Olá!");
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (meta.full_name as string) ||
        (meta.name as string) ||
        (u?.email ? u.email.split("@")[0] : "");
      if (name) setGreeting(`Olá, ${name.split(" ")[0]}!`);
    });
  }, []);

  const q = useQuery({
    queryKey: ["dashboard-agency", brandId],
    queryFn: () => fn({ data: { brandId } }),
    staleTime: 30_000,
  });

  const d = q.data;
  const criticalAlerts = (d?.alerts ?? []).filter((a) => a.severity !== "info").length;
  const avgHealth = d?.healths.length
    ? Math.round(d.healths.reduce((s, h) => s + h.score, 0) / d.healths.length)
    : 0;

  usePageHeader(
    {
      title: greeting,
      subtitle: `Visão consolidada · ${d?.counts.clients ?? 0} contas ativas · saúde média ${avgHealth}%`,
    },
    [greeting, d?.counts.clients, avgHealth],
  );

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <StatusBanner
        avgHealth={avgHealth}
        criticalAlerts={criticalAlerts}
        approvals={d?.counts.approvals_pending ?? 0}
        overdue={d?.counts.tasks_overdue ?? 0}
      />

      {/* KPI Grid with sparklines */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Publicações aprovadas · 30d"
          value={d?.counts.posts_approved_30d ?? 0}
          sub={`${d?.counts.posts_total ?? 0} no total`}
          tone="emerald"
          spark={d?.publishTrend14d}
        />
        <KpiCard
          icon={<BadgeCheck className="h-4 w-4" />}
          label="Aprovações pendentes"
          value={d?.counts.approvals_pending ?? 0}
          sub={d?.approvalsQueue[0]?.client_name ? `Mais antiga: ${d.approvalsQueue[0].client_name}` : "Sem fila"}
          tone="amber"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Tarefas atrasadas"
          value={d?.counts.tasks_overdue ?? 0}
          sub={`${d?.counts.tasks_open ?? 0} abertas · ${d?.counts.tasks_done_7d ?? 0} concluídas 7d`}
          tone="rose"
        />
        <KpiCard
          icon={<Bot className="h-4 w-4" />}
          label="Custo IA · 30d"
          value={`$${(d?.aiUsage.cost30d ?? 0).toFixed(2)}`}
          sub={`${d?.aiUsage.jobs30d ?? 0} execuções · $${(d?.aiUsage.cost7d ?? 0).toFixed(2)} nos 7d`}
          tone="violet"
          spark={d?.aiUsage.spark14d.map((v) => Math.round(v * 100))}
        />
      </div>

      {/* Alerts strip */}
      {(d?.alerts.length ?? 0) > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {d!.alerts.slice(0, 4).map((a) => (
            <AlertChip key={a.id} alert={a} />
          ))}
        </div>
      )}

      {/* Health ranking + Funnel */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ClientHealthRanking healths={d?.healths ?? []} loading={q.isLoading} />
        <FunnelCard postsByStage={d?.postsByStage ?? {}} avgLead={d?.avgLeadTimeDays ?? null} />
      </div>

      {/* AI usage + Publish trend */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <AiUsageCard usage={d?.aiUsage} />
        <PublishTrendCard trend={d?.publishTrend14d ?? []} channels={d?.topChannels ?? []} />
      </div>

      {/* Approvals queue + Upcoming */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ApprovalsQueueCard items={d?.approvalsQueue ?? []} loading={q.isLoading} />
        <UpcomingCard items={d?.upcoming ?? []} loading={q.isLoading} />
      </div>

      {/* Heatmap 60d */}
      <HeatmapCard heatmap={d?.heatmap ?? []} />
    </div>
  );
}

function StatusBanner({
  avgHealth,
  criticalAlerts,
  approvals,
  overdue,
}: {
  avgHealth: number;
  criticalAlerts: number;
  approvals: number;
  overdue: number;
}) {
  const isCalm = criticalAlerts === 0 && overdue === 0 && approvals < 3;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/8 via-card to-card p-5">
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid h-11 w-11 place-items-center rounded-xl border",
              isCalm
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-amber-500/30 bg-amber-500/10 text-amber-500",
            )}
          >
            {isCalm ? <CheckCircle2 className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
          </div>
          <div>
            <div className="text-sm font-semibold">
              {isCalm ? "Operação sob controle" : "Requer atenção"}
            </div>
            <div className="text-xs text-muted-foreground">
              Saúde média da carteira ·{" "}
              <span className="font-medium text-foreground">{avgHealth}%</span>
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StatusPill icon={<AlertTriangle className="h-3 w-3" />} label="Alertas críticos" value={criticalAlerts} tone={criticalAlerts ? "rose" : "muted"} />
          <StatusPill icon={<BadgeCheck className="h-3 w-3" />} label="Aprovações" value={approvals} tone={approvals > 5 ? "amber" : "muted"} />
          <StatusPill icon={<Clock className="h-3 w-3" />} label="Tarefas atrasadas" value={overdue} tone={overdue ? "rose" : "muted"} />
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "rose" | "amber" | "muted";
}) {
  const cls = {
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-500",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    muted: "border-border/60 bg-muted/40 text-muted-foreground",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", cls)}>
      {icon}
      <span>{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const KPI_TONES = {
  emerald: { ring: "ring-emerald-500/20", accent: "text-emerald-500", bar: "bg-emerald-500" },
  amber: { ring: "ring-amber-500/20", accent: "text-amber-500", bar: "bg-amber-500" },
  rose: { ring: "ring-rose-500/20", accent: "text-rose-500", bar: "bg-rose-500" },
  violet: { ring: "ring-violet-500/20", accent: "text-violet-500", bar: "bg-violet-500" },
  sky: { ring: "ring-sky-500/20", accent: "text-sky-500", bar: "bg-sky-500" },
  pink: { ring: "ring-pink-500/20", accent: "text-pink-500", bar: "bg-pink-500" },
} as const;

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
  spark,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  tone: keyof typeof KPI_TONES;
  spark?: number[];
}) {
  const t = KPI_TONES[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-4">
      <span className={cn("absolute inset-x-0 top-0 h-0.5", t.bar)} />
      <div className="flex items-start justify-between">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-background/60", t.accent)}>
          {icon}
        </span>
        {spark && spark.some((v) => v > 0) ? (
          <Sparkline data={spark} className={cn("h-6 w-20", t.accent)} />
        ) : null}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function AlertChip({ alert }: { alert: AgencyDashboard["alerts"][number] }) {
  const tone = {
    critical: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  }[alert.severity];
  const Icon = alert.severity === "info" ? Info : AlertTriangle;
  const content = (
    <div className={cn("group flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:shadow-sm", tone)}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{alert.title}</div>
        <div className="truncate text-xs text-muted-foreground">{alert.description}</div>
      </div>
      <span className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-xs tabular-nums text-foreground">
        {alert.count}
      </span>
    </div>
  );
  return alert.href ? (
    <Link to={alert.href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

function ClientHealthRanking({
  healths,
  loading,
}: {
  healths: ClientHealth[];
  loading: boolean;
}) {
  const sorted = [...healths].sort((a, b) => a.score - b.score);
  return (
    <Card
      title="Saúde dos clientes"
      subtitle="Score ponderado por pontualidade, aprovações, briefing e agenda"
      icon={<Gauge className="h-4 w-4" />}
      action={
        <Link to="/customers" className="text-xs text-muted-foreground hover:text-foreground">
          Ver todos →
        </Link>
      }
    >
      {loading ? (
        <SkeletonList />
      ) : sorted.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} text="Nenhum cliente cadastrado." />
      ) : (
        <ul className="divide-y divide-border/40">
          {sorted.slice(0, 8).map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="h-8 w-8 shrink-0 rounded-lg text-center text-xs font-semibold leading-8 text-white"
                style={{ background: h.color ?? "#6366f1" }}
              >
                {h.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: h.id }}
                    className="truncate text-sm font-medium hover:text-primary"
                  >
                    {h.name}
                  </Link>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                    {h.score}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <HealthBar score={h.score} className="flex-1" />
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {h.overdueTasks > 0 && <span className="text-rose-500">{h.overdueTasks} atr.</span>}
                    {h.overdueTasks > 0 && h.approvalsPending > 0 && " · "}
                    {h.approvalsPending > 0 && <span className="text-amber-500">{h.approvalsPending} aprov.</span>}
                    {h.overdueTasks === 0 && h.approvalsPending === 0 && (
                      <span>{h.openTasks} tarefas · {h.lastPostAt ? formatDistanceToNow(new Date(h.lastPostAt), { locale: ptBR, addSuffix: true }) : "sem posts"}</span>
                    )}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FUNNEL_STAGES: Array<{ key: string; label: string; color: string }> = [
  { key: "idea", label: "Ideia", color: "bg-sky-500" },
  { key: "production", label: "Produção", color: "bg-amber-500" },
  { key: "review", label: "Revisão", color: "bg-orange-500" },
  { key: "approved", label: "Aprovado", color: "bg-emerald-500" },
  { key: "scheduled", label: "Agendado", color: "bg-violet-500" },
  { key: "published", label: "Publicado", color: "bg-pink-500" },
];

function FunnelCard({
  postsByStage,
  avgLead,
}: {
  postsByStage: Record<string, number>;
  avgLead: number | null;
}) {
  const max = Math.max(1, ...FUNNEL_STAGES.map((s) => postsByStage[s.key] ?? 0));
  const total = FUNNEL_STAGES.reduce((s, x) => s + (postsByStage[x.key] ?? 0), 0);
  const published = postsByStage.published ?? 0;
  const conv = total ? Math.round((published / total) * 100) : 0;
  return (
    <Card
      title="Funil editorial"
      subtitle={`${total} peças no pipeline · conversão ${conv}%`}
      icon={<Layers className="h-4 w-4" />}
      action={
        <Link to="/content" className="text-xs text-muted-foreground hover:text-foreground">
          Kanban →
        </Link>
      }
    >
      <div className="space-y-2 px-4 py-3">
        {FUNNEL_STAGES.map((s) => {
          const n = postsByStage[s.key] ?? 0;
          const w = Math.max(4, (n / max) * 100);
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{s.label}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/50">
                <div
                  className={cn("h-full rounded-md opacity-80 transition-all", s.color)}
                  style={{ width: `${w}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-medium text-foreground">
                  {n}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {avgLead !== null && (
        <div className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3" />
          Lead time médio ideia→publicação:{" "}
          <span className="font-mono font-medium text-foreground">{avgLead.toFixed(1)}d</span>
        </div>
      )}
    </Card>
  );
}

function AiUsageCard({ usage }: { usage: AiUsageSummary | undefined }) {
  const rows = usage?.byAgent ?? [];
  const max = Math.max(0.01, ...rows.map((r) => r.cost));
  return (
    <Card
      title="IA & performance"
      subtitle="Consumo por agente · últimos 30 dias"
      icon={<Bot className="h-4 w-4" />}
      action={
        <Link to="/connections" className="text-xs text-muted-foreground hover:text-foreground">
          Conexões →
        </Link>
      }
    >
      <div className="px-4 py-3">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="font-mono text-2xl font-semibold tabular-nums">
              ${(usage?.cost30d ?? 0).toFixed(2)}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Custo · 30d · {usage?.jobs30d ?? 0} execuções
            </div>
          </div>
          {usage && usage.spark14d.some((v) => v > 0) && (
            <Sparkline
              data={usage.spark14d.map((v) => Math.round(v * 1000))}
              className="h-8 w-24 text-violet-500"
            />
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Zap className="h-5 w-5" />} text="Nenhum agente executado ainda." />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.agent}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{r.agent}</span>
                  <span className="ml-2 font-mono tabular-nums text-muted-foreground">
                    ${r.cost.toFixed(3)} · {r.jobs}×
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    style={{ width: `${(r.cost / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  blog: "Blog",
  x: "X / Twitter",
  threads: "Threads",
};

function PublishTrendCard({
  trend,
  channels,
}: {
  trend: number[];
  channels: Array<{ channel: string; count: number }>;
}) {
  const chartData = trend.map((v, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { day: format(d, "dd/MM"), posts: v };
  });
  return (
    <Card
      title="Publicações · 14 dias"
      subtitle="Ritmo de publicações e canais mais usados"
      icon={<TrendingUp className="h-4 w-4" />}
    >
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-40 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="pubGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12, borderRadius: 8 }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
              />
              <Area type="monotone" dataKey="posts" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#pubGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Top canais
          </div>
          {channels.length === 0 ? (
            <div className="text-xs text-muted-foreground">Sem publicações.</div>
          ) : (
            <ul className="space-y-1.5">
              {channels.slice(0, 5).map((c) => (
                <li key={c.channel} className="flex items-center justify-between text-xs">
                  <span className="truncate">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function ApprovalsQueueCard({
  items,
  loading,
}: {
  items: AgencyDashboard["approvalsQueue"];
  loading: boolean;
}) {
  return (
    <Card
      title="Fila de aprovações"
      subtitle="Publicações aguardando decisão do cliente"
      icon={<BadgeCheck className="h-4 w-4" />}
      action={
        <Link to="/content" className="text-xs text-muted-foreground hover:text-foreground">
          Ver Kanban →
        </Link>
      }
    >
      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} text="Nenhuma aprovação pendente." />
      ) : (
        <ul className="divide-y divide-border/40">
          {items.slice(0, 6).map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {it.client_name} · aguardando{" "}
                  {formatDistanceToNow(new Date(it.waiting_since), { locale: ptBR })}
                </div>
              </div>
              <Link
                to="/customers/$customerId"
                params={{ customerId: it.client_id }}
                className="shrink-0 rounded-md border border-border/60 bg-background/60 p-1.5 text-muted-foreground transition hover:text-foreground"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UpcomingCard({
  items,
  loading,
}: {
  items: AgencyDashboard["upcoming"];
  loading: boolean;
}) {
  return (
    <Card
      title="Próximos 7 dias"
      subtitle="Publicações agendadas e tarefas com prazo"
      icon={<CalendarClock className="h-4 w-4" />}
      action={
        <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">
          Calendário →
        </Link>
      }
    >
      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-5 w-5" />} text="Semana vazia. Bora produzir!" />
      ) : (
        <ul className="divide-y divide-border/40">
          {items.slice(0, 6).map((it) => (
            <li key={`${it.kind}-${it.id}`} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
                  it.kind === "post"
                    ? "border-pink-500/30 bg-pink-500/10 text-pink-500"
                    : "border-sky-500/30 bg-sky-500/10 text-sky-500",
                )}
              >
                {it.kind === "post" ? <Sparkles className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{it.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {it.client_name ?? "—"} · {format(new Date(it.when), "EEE dd/MM · HH:mm", { locale: ptBR })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HeatmapCard({ heatmap }: { heatmap: number[] }) {
  const max = Math.max(1, ...heatmap);
  return (
    <Card
      title="Ritmo de publicações · 60 dias"
      subtitle="Cada quadrado representa um dia"
      icon={<Radar className="h-4 w-4" />}
    >
      <div className="flex flex-wrap gap-1 px-4 py-4">
        {heatmap.map((n, i) => {
          const intensity = n === 0 ? 0 : 0.15 + (n / max) * 0.85;
          return (
            <span
              key={i}
              title={`${n} publicação(ões)`}
              className="h-4 w-4 rounded-sm border border-border/40"
              style={{ background: `color-mix(in oklab, hsl(var(--primary)) ${Math.round(intensity * 100)}%, transparent)` }}
            />
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================================
// CLIENT MODE
// ============================================================================

function ClientMode({ brandId, clientId }: { brandId: string; clientId: string }) {
  const statsFn = useServerFn(getDashboardStats);
  const customerFn = useServerFn(loadCustomerDashboardFn);
  const agencyFn = useServerFn(getAgencyDashboardFn);

  const stats = useQuery({
    queryKey: ["dashboard-client", brandId, clientId],
    queryFn: () => statsFn({ data: { brandId, clientId } }),
    staleTime: 30_000,
  });
  const customer = useQuery({
    queryKey: ["customer-dashboard", brandId, clientId],
    queryFn: () => customerFn({ data: { brandId, clientId } }),
    staleTime: 30_000,
  });
  const agency = useQuery({
    queryKey: ["dashboard-agency", brandId],
    queryFn: () => agencyFn({ data: { brandId } }),
    staleTime: 60_000,
  });

  const client = customer.data?.client;
  const health = agency.data?.healths.find((h) => h.id === clientId);

  usePageHeader(
    {
      title: client?.name ?? "Cliente",
      subtitle: client?.niche ?? "Painel do cliente selecionado",
    },
    [client?.name, client?.niche],
  );

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <ClientHeroCard client={client ?? null} health={health ?? null} loading={customer.isLoading} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Publicações aprovadas · 30d"
          value={stats.data?.counts.posts_approved_30d ?? 0}
          sub={`${stats.data?.counts.posts_total ?? 0} peças no total`}
          tone="emerald"
          spark={stats.data?.publishTrend14d}
        />
        <KpiCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Agendadas · 7d"
          value={stats.data?.upcomingPosts.length ?? 0}
          sub={stats.data?.upcomingPosts[0]?.title ?? "Sem agendas"}
          tone="violet"
        />
        <KpiCard
          icon={<BadgeCheck className="h-4 w-4" />}
          label="Aprovações pendentes"
          value={stats.data?.counts.approvals_pending ?? 0}
          sub={`${customer.data?.metrics.pendingApprovals ?? 0} decisões abertas`}
          tone="amber"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Tarefas atrasadas"
          value={stats.data?.counts.tasks_overdue ?? 0}
          sub={`${stats.data?.counts.tasks_open ?? 0} abertas · ${stats.data?.counts.tasks_done_7d ?? 0} feitas 7d`}
          tone="rose"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <FunnelCard
          postsByStage={stats.data?.postsByStage ?? {}}
          avgLead={stats.data?.avgLeadTimeDays ?? null}
        />
        <PublishTrendCard
          trend={stats.data?.publishTrend14d ?? []}
          channels={Object.entries(stats.data?.channelCounts ?? {}).map(([channel, count]) => ({ channel, count }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ClientPortalCard
          clientId={clientId}
          portalTokens={(customer.data?.portalTokens ?? []) as PortalToken[]}
        />
        <UpcomingClientCard posts={stats.data?.upcomingPosts ?? []} loading={stats.isLoading} />
      </div>

      <RecentActivityCard activity={stats.data?.recentActivity ?? []} loading={stats.isLoading} />
    </div>
  );
}

type ClientRow = NonNullable<
  Awaited<ReturnType<typeof loadCustomerDashboardFn>>["client"]
>;

function ClientHeroCard({
  client,
  health,
  loading,
}: {
  client: ClientRow | null;
  health: ClientHealth | null;
  loading: boolean;
}) {
  if (loading) return <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card" />;
  if (!client) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
        Cliente não encontrado.
      </div>
    );
  }
  const socials = (client.socials && typeof client.socials === "object"
    ? (client.socials as Record<string, string | undefined>)
    : {}) ?? {};
  const initials = client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-card to-card p-5">
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start gap-5">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-lg font-semibold text-white shadow-lg"
          style={{ background: client.color ?? "linear-gradient(135deg,#6366f1,#ec4899)" }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{client.name}</h1>
            {client.is_active && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                Ativo
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{client.niche ?? "Sem nicho definido"}</div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {client.contact_name && (
              <span className="inline-flex items-center gap-1.5">
                <UserPlus className="h-3 w-3" /> {client.contact_name}
              </span>
            )}
            {client.contact_email && (
              <a href={`mailto:${client.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Mail className="h-3 w-3" /> {client.contact_email}
              </a>
            )}
            {socials.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> {socials.phone}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {renderSocial("instagram", socials.instagram, Instagram, "https://instagram.com/")}
            {renderSocial("tiktok", socials.tiktok, Music2, "https://tiktok.com/@")}
            {renderSocial("linkedin", socials.linkedin, Linkedin, "https://linkedin.com/in/")}
            {renderSocial("youtube", socials.youtube, Youtube, "https://youtube.com/@")}
          </div>
        </div>

        {health && (
          <div className="min-w-[220px] rounded-xl border border-border/60 bg-background/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Saúde da conta
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">{health.score}%</span>
            </div>
            <HealthBar score={health.score} className="mt-2" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <HealthCell label="Pontualidade" value={health.breakdown.onTime} max={40} />
              <HealthCell label="Aprovações" value={health.breakdown.approvals} max={30} />
              <HealthCell label="Briefing" value={health.breakdown.briefing} max={15} />
              <HealthCell label="Agenda" value={health.breakdown.schedule} max={15} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HealthCell({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function renderSocial(
  key: string,
  handle: string | undefined,
  Icon: React.ComponentType<{ className?: string }>,
  prefix: string,
) {
  if (!handle) return null;
  const clean = handle.replace(/^@/, "");
  return (
    <a
      key={key}
      href={`${prefix}${clean}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-border hover:text-foreground"
    >
      <Icon className="h-3 w-3" />@{clean}
      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
    </a>
  );
}

type PortalToken = {
  id: string;
  token: string;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function ClientPortalCard({
  clientId,
  portalTokens,
}: {
  clientId: string;
  portalTokens: PortalToken[];
}) {
  const qc = useQueryClient();
  const createToken = useServerFn(createPortalTokenFn);
  const [label, setLabel] = React.useState("");
  const [expires, setExpires] = React.useState<Date | undefined>(undefined);
  const mut = useMutation({
    mutationFn: async () => {
      const expiresInDays = expires
        ? Math.max(1, Math.ceil((expires.getTime() - Date.now()) / 86_400_000))
        : null;
      return createToken({
        data: { clientId, label: label.trim() || "Link público", expiresInDays },
      });
    },
    onSuccess: () => {
      toast.success("Link do portal gerado.");
      setLabel("");
      setExpires(undefined);
      qc.invalidateQueries({ queryKey: ["customer-dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message ?? "Falha ao gerar link"),
  });
  const active = portalTokens.filter((t) => !t.revoked_at);
  return (
    <Card
      title="Portal público"
      subtitle="Compartilhe uma URL somente-leitura com o cliente"
      icon={<ExternalLink className="h-4 w-4" />}
    >
      <div className="px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <Input placeholder="Identificação (ex: Cliente ACME)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start font-normal", !expires && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {expires ? format(expires, "PPP", { locale: ptBR }) : "Expiração"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar mode="single" selected={expires} onSelect={setExpires} initialFocus className="pointer-events-auto p-3" disabled={(d) => d < new Date()} />
            </PopoverContent>
          </Popover>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Gerar
          </Button>
        </div>
        {active.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {active.slice(0, 4).map((t) => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${t.token}`;
              return (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.label ?? "Link público"}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">{url}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copiado."); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function UpcomingClientCard({
  posts,
  loading,
}: {
  posts: DashboardStats["upcomingPosts"];
  loading: boolean;
}) {
  return (
    <Card
      title="Próximas publicações"
      subtitle="7 dias"
      icon={<CalendarClock className="h-4 w-4" />}
      action={<Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">Calendário →</Link>}
    >
      {loading ? (
        <SkeletonList />
      ) : posts.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-5 w-5" />} text="Sem publicações agendadas." />
      ) : (
        <ul className="divide-y divide-border/40">
          {posts.slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">{p.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {p.scheduled_at ? format(new Date(p.scheduled_at), "dd MMM · HH:mm", { locale: ptBR }) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentActivityCard({
  activity,
  loading,
}: {
  activity: DashboardStats["recentActivity"];
  loading: boolean;
}) {
  return (
    <Card
      title="Atividade recente"
      subtitle="Eventos das últimas 2 semanas"
      icon={<Sparkles className="h-4 w-4" />}
      action={<Link to="/notifications" className="text-xs text-muted-foreground hover:text-foreground">Ver tudo →</Link>}
    >
      {loading ? (
        <SkeletonList />
      ) : activity.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-5 w-5" />} text="Nenhuma atividade ainda." />
      ) : (
        <ul className="divide-y divide-border/40">
          {activity.slice(0, 10).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">
                <span className="font-medium capitalize">{a.entity_type}</span>{" "}
                <span className="text-muted-foreground">{a.verb}</span>
                {a.payload?.title ? <span className="ml-1 text-muted-foreground">· {a.payload.title}</span> : null}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {format(new Date(a.created_at), "dd MMM · HH:mm", { locale: ptBR })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ============================================================================
// Shared primitives
// ============================================================================

function Card({
  title,
  subtitle,
  icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{title}</div>
            {subtitle && <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-muted/40" />
      ))}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-background/40 text-muted-foreground">
        {icon}
      </div>
      <div className="text-xs text-muted-foreground">{text}</div>
    </div>
  );
}