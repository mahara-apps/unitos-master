// Central de acompanhamento da conta do cliente.
// Regra: todo número exibido vem de `clientDashboardFn` (dados reais, escopados
// por brand_id + client_id). Nada é mockado; sem dados usamos empty states.
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Layers,
  Send,
} from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { clientDashboardFn } from "@/lib/client-dashboard.functions";
import { channelLabel } from "@/lib/client-dashboard.labels";
import type {
  ClientAttentionItem,
  ClientDashboard,
  ClientUpcomingItem,
} from "@/lib/client-dashboard.types";

export function ClientAccountDashboard({
  brandId,
  clientId,
  range,
}: {
  brandId: string;
  clientId: string;
  range: DateRange | undefined;
}) {
  const fn = useServerFn(clientDashboardFn);
  const rangeKey = `${range?.from?.toISOString() ?? ""}|${range?.to?.toISOString() ?? ""}`;
  const q = useQuery({
    queryKey: ["client-account-dashboard", brandId, clientId, rangeKey],
    queryFn: () =>
      fn({
        data: {
          brandId,
          clientId,
          range:
            range?.from && range?.to
              ? { from: range.from.toISOString(), to: range.to.toISOString() }
              : undefined,
        },
      }),
    staleTime: 30_000,
  });
  const d = q.data;

  if (q.isLoading && !d) {
    return (
      <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-32" />
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (q.isError || !d) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <Panel title="Não foi possível carregar o painel">
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Tente atualizar a página. Se o erro continuar, verifique a conexão com o servidor.
          </div>
        </Panel>
      </div>
    );
  }

  const problems = d.failedCount + d.connectionsNeedingAttention;

  return (
    <div className="w-full space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── BLOCO 1 — Resumo operacional ─────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Layers className="h-4 w-4" />}
          label="Conteúdos em produção"
          value={d.pipelineTotal}
          sub={
            d.stages.filter((s) => s.count > 0).length
              ? d.stages
                  .filter((s) => s.count > 0)
                  .slice(0, 4)
                  .map((s) => `${s.count} ${s.label.toLowerCase()}`)
                  .join(" · ")
              : "Nenhum conteúdo no pipeline"
          }
          to="/content"
        />
        <SummaryCard
          icon={<BadgeCheck className="h-4 w-4" />}
          label="Aprovações"
          value={d.approvalsPending}
          sub={
            d.approvalsPending > 0
              ? `${d.approvalsPending} aguardando sua aprovação`
              : d.approvalsDecided > 0
                ? `${d.approvalsDecided} já decididas`
                : "Sem pendências"
          }
          tone={d.approvalsPending > 0 ? "attention" : "muted"}
          to="/content"
        />
        <SummaryCard
          icon={<Send className="h-4 w-4" />}
          label="Publicações"
          value={d.publishedInRange}
          sub={
            d.publishedPreviousRange != null
              ? `${formatDelta(d.publishedInRange - d.publishedPreviousRange)} vs. período anterior`
              : `Últimos ${d.rangeDays} dias`
          }
          to="/calendar"
        />
        <SummaryCard
          icon={problems ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          label="Falhas / atenção"
          value={problems}
          sub={
            problems === 0
              ? "Tudo funcionando"
              : [
                  d.failedCount > 0 &&
                    `${d.failedCount} ${d.failedCount === 1 ? "publicação falhou" : "publicações falharam"}`,
                  d.connectionsNeedingAttention > 0 &&
                    `${d.connectionsNeedingAttention} ${
                      d.connectionsNeedingAttention === 1 ? "conexão" : "conexões"
                    } precisa de atenção`,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
          tone={problems ? "critical" : "muted"}
          to={d.failedCount > 0 ? "/calendar" : "/connections"}
        />
      </section>

      {/* ── BLOCO 2/7 — Saúde da operação (fluxo editorial) ── */}
      <Panel
        title="Saúde da operação"
        subtitle="Distribuição real dos conteúdos no fluxo editorial"
        action={
          <Link
            to="/customers/$customerId/pauta"
            params={{ customerId: clientId }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Abrir pauta →
          </Link>
        }
      >
        {d.pipelineTotal === 0 ? (
          <PanelEmpty text="Nenhum conteúdo no fluxo editorial deste cliente ainda." />
        ) : (
          <div className="space-y-3 px-4 py-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {d.stages
                .filter((s) => s.count > 0)
                .map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      width: `${s.share * 100}%`,
                      background: `var(--chart-${(i % 5) + 1})`,
                    }}
                    title={`${s.label}: ${s.count}`}
                  />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {d.stages.map((s, i) => (
                <Link
                  key={s.id}
                  to="/content"
                  className={cn(
                    "group rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40",
                    s.count === 0 && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: `var(--chart-${(i % 5) + 1})` }}
                    />
                    <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-lg font-semibold tabular-nums">{s.count}</span>
                    {d.pipelineTotal > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {Math.round(s.share * 100)}%
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            {d.bottleneck && (
              <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {d.bottleneck.count} conteúdos parados em {d.bottleneck.label} (
                {Math.round(d.bottleneck.share * 100)}% do pipeline)
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* ── BLOCO 3/4 — Publicações + canais ─────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Publicações ao longo do tempo"
          subtitle="Quantidade de conteúdos publicados no período"
        >
          {d.publishedInRange === 0 ? (
            <PanelEmpty text="Ainda não há publicações suficientes para gerar este gráfico." />
          ) : (
            <div className="space-y-3 px-4 py-4">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={d.publishTrend}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={shortDay}
                    tick={{ fontSize: 10 }}
                    stroke="var(--muted-foreground)"
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={22}
                    tick={{ fontSize: 10 }}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => longDay(String(v))}
                    formatter={(v: number) => [`${v}`, "Publicações"]}
                  />
                  <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="Total publicado" value={String(d.publishedInRange)} />
                <MiniStat
                  label="Média por semana"
                  value={d.avgPerWeek != null ? d.avgPerWeek.toFixed(1) : "—"}
                />
                <MiniStat
                  label="Melhor dia"
                  value={d.bestDay ? `${shortDay(d.bestDay.day)} · ${d.bestDay.count}` : "—"}
                />
                <MiniStat
                  label="Canal mais usado"
                  value={
                    d.channelBreakdown[0] ? channelLabel(d.channelBreakdown[0].channel) : "—"
                  }
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Desempenho por canal" subtitle="Somente canais com publicações no período">
          {d.channelBreakdown.length === 0 ? (
            <PanelEmpty text="Nenhuma publicação por canal registrada no período." />
          ) : d.channelBreakdown.length === 1 ? (
            <div className="px-4 py-6">
              <div className="text-sm font-semibold">
                {channelLabel(d.channelBreakdown[0].channel)}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {d.channelBreakdown[0].count}
              </div>
              <p className="text-xs text-muted-foreground">
                {d.channelBreakdown[0].count === 1 ? "publicação" : "publicações"} no período
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {d.channelBreakdown.map((c, i) => (
                <li key={c.channel} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{channelLabel(c.channel)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.count} · {Math.round(c.share * 100)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.share * 100}%`,
                        background: `var(--chart-${(i % 5) + 1})`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── BLOCO 5/6 — Próximas publicações + atenção ───── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Próximas publicações"
          subtitle="Agenda dos próximos 7 dias"
          action={
            <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">
              Ver calendário →
            </Link>
          }
        >
          {d.upcoming.length === 0 ? (
            <PanelEmpty text="Nenhuma publicação agendada nos próximos 7 dias." />
          ) : (
            <ul className="divide-y divide-border/40">
              {d.upcoming.map((item) => (
                <UpcomingRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Atenção necessária"
          subtitle={d.attention.length ? "Itens que exigem ação" : "Nenhuma ação necessária"}
          muted={d.attention.length === 0}
        >
          {d.attention.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-6">
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-medium">Tudo em dia</div>
                <p className="text-xs text-muted-foreground">
                  Nenhuma ação necessária no momento.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {d.attention.map((a) => (
                <AttentionRow key={a.id} item={a} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── BLOCO 9 — Atividade recente ──────────────────── */}
      <Panel title="Atividade recente" subtitle="O que aconteceu na conta">
        {d.activity.length === 0 ? (
          <PanelEmpty text="Nenhuma atividade registrada no período." />
        ) : (
          <ul className="divide-y divide-border/40">
            {d.activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    a.tone === "positive"
                      ? "bg-emerald-500"
                      : a.tone === "attention"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/50",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.description}</div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {format(parseISO(a.at), "dd MMM · HH:mm", { locale: ptBR })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Desempenho de conteúdos: só existirá quando houver coleta real. */}
      {!d.hasPerformanceData && (
        <p className="text-center text-xs text-muted-foreground">
          Dados de desempenho (alcance, impressões e engajamento) ainda não disponíveis para esta
          conta.
        </p>
      )}
    </div>
  );
}

// ── primitivas locais ───────────────────────────────────────

function Panel({
  title,
  subtitle,
  action,
  muted,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-card",
        muted && "bg-card/60",
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-xs text-muted-foreground">{text}</p>;
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tone = "muted",
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  tone?: "muted" | "attention" | "critical";
  to: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40",
        tone === "critical"
          ? "border-destructive/40"
          : tone === "attention"
            ? "border-amber-500/40"
            : "border-border/60",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
            tone === "critical" && "text-destructive",
            tone === "attention" && "text-amber-600 dark:text-amber-400",
          )}
        >
          {icon}
          {label}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sub}</p>
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

const UPCOMING_STATUS: Record<
  ClientUpcomingItem["status"],
  { label: string; className: string }
> = {
  scheduled: { label: "Agendado", className: "border-border/60 text-muted-foreground" },
  awaiting_approval: {
    label: "Aguardando aprovação",
    className: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  },
  failed: { label: "Falha", className: "border-destructive/40 text-destructive" },
  published: {
    label: "Publicado",
    className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  },
};

function UpcomingRow({ item }: { item: ClientUpcomingItem }) {
  const status = UPCOMING_STATUS[item.status];
  return (
    <li>
      <Link
        to="/content"
        search={{ post: item.id }}
        className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
      >
        <span className="w-[86px] shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {format(parseISO(item.scheduledAt), "dd MMM · HH:mm", { locale: ptBR })}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[item.channels.join(" + ") || null, item.format].filter(Boolean).join(" · ") ||
              "Sem canal definido"}
          </div>
        </div>
        <Badge variant="outline" className={cn("shrink-0 text-[10px]", status.className)}>
          {status.label}
        </Badge>
      </Link>
    </li>
  );
}

function AttentionRow({ item }: { item: ClientAttentionItem }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-1 h-2 w-2 shrink-0 rounded-full",
          item.severity === "critical" ? "bg-destructive" : "bg-amber-500",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{item.title}</div>
        <p className="truncate text-xs text-muted-foreground">{item.description}</p>
        {item.detail && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/80">{item.detail}</p>
        )}
      </div>
      {item.action && (
        <Button asChild size="sm" variant="outline" className="h-7 shrink-0 text-xs">
          <Link to={item.action.to}>{item.action.label}</Link>
        </Button>
      )}
    </li>
  );
}

function shortDay(iso: string): string {
  return format(parseISO(`${iso}T12:00:00`), "dd/MM", { locale: ptBR });
}
function longDay(iso: string): string {
  return format(parseISO(`${iso}T12:00:00`), "dd 'de' MMMM", { locale: ptBR });
}
function formatDelta(delta: number): string {
  if (delta === 0) return "estável";
  return `${delta > 0 ? "+" : ""}${delta}`;
}

// Ícone não usado diretamente aqui, mantido para clareza de intenção.
void CalendarClock;
