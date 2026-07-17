import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Brain,
  Calendar,
  Compass,
  Filter,
  Gauge,
  Lightbulb,
  Network,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Waypoints,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brainIntelligenceFn, type BrainIntelligence } from "@/lib/brain/api";

type Filters = {
  clientId: string | null;
  projectId: string | null;
  actorId: string | null;
  category: string | null;
  days: number;
};

const ALL = "__all__";

export function BrainDashboard({ brandId }: { brandId?: string | null }) {
  const [filters, setFilters] = useState<Filters>({
    clientId: null,
    projectId: null,
    actorId: null,
    category: null,
    days: 30,
  });

  const fetchIntel = useServerFn(brainIntelligenceFn);
  const q = useQuery({
    queryKey: ["brain-intel", brandId ?? "all", filters],
    queryFn: () =>
      fetchIntel({
        data: {
          brandId: brandId ?? null,
          clientId: filters.clientId,
          projectId: filters.projectId,
          actorId: filters.actorId,
          category: filters.category,
          days: filters.days,
        },
      }),
    refetchInterval: 45_000,
  });
  const d = q.data;

  return (
    <div className="space-y-6 p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-6">
        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--primary) 20%, transparent), transparent 55%)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-border/60 bg-background/70 backdrop-blur">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">O Brain está aprendendo</h2>
              <p className="text-sm text-muted-foreground">
                Conhecimento consolidado de toda a operação — atualizado continuamente a partir dos eventos da agência.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {brandId ? "Marca" : "Agência"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link to="/brain/graph">
                <Network className="mr-1.5 h-3.5 w-3.5" />
                Knowledge Graph
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FiltersBar
        data={d}
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi loading={q.isLoading} icon={<Brain className="h-4 w-4 text-primary" />} label="Conhecimentos" value={d?.kpis.knowledge} />
        <Kpi loading={q.isLoading} icon={<Sparkles className="h-4 w-4" style={{ color: "var(--chart-4)" }} />} label="Memórias" value={d?.kpis.memories} />
        <Kpi loading={q.isLoading} icon={<Lightbulb className="h-4 w-4" style={{ color: "var(--chart-3)" }} />} label="Insights" value={d?.kpis.insights} />
        <Kpi loading={q.isLoading} icon={<Target className="h-4 w-4" style={{ color: "var(--chart-2)" }} />} label="Recomendações" value={d?.kpis.recommendations} />
        <Kpi loading={q.isLoading} icon={<Gauge className="h-4 w-4" style={{ color: "var(--chart-5)" }} />} label="Confiança média" value={d ? Math.round(d.kpis.avgConfidence * 100) : undefined} suffix="%" />
        <Kpi loading={q.isLoading} icon={<Waypoints className="h-4 w-4 text-muted-foreground" />} label="Padrões descobertos" value={d?.kpis.patterns} />
      </div>

      {/* Learned Today */}
      <Section title="O Brain aprendeu hoje" icon={<Zap className="h-4 w-4 text-primary" />} description="Atividade de aprendizado desde 00:00.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MicroStat loading={q.isLoading} label="Eventos capturados" value={d?.learnedToday.events} />
          <MicroStat loading={q.isLoading} label="Memórias atualizadas" value={d?.learnedToday.memoriesUpdated} />
          <MicroStat loading={q.isLoading} label="Insights criados" value={d?.learnedToday.insightsCreated} />
          <MicroStat loading={q.isLoading} label="Recomendações" value={d?.learnedToday.recommendationsCreated} />
          <MicroStat loading={q.isLoading} label="Conhecimento reforçado" value={d?.learnedToday.knowledgeReinforced} />
        </div>
      </Section>

      {/* Timeline + Knowledge Map */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
          title="Linha do tempo de aprendizado"
          icon={<Calendar className="h-4 w-4 text-primary" />}
          description={`Eventos e insights nos últimos ${filters.days} dias.`}
        >
          {q.isLoading ? <Skeleton className="h-40" /> : <Timeline data={d?.learningTimeline ?? []} />}
        </Section>

        <Section title="Mapa de conhecimento" icon={<Compass className="h-4 w-4 text-primary" />} description="Distribuição por categoria.">
          {q.isLoading ? (
            <Skeleton className="h-40" />
          ) : (d?.knowledgeMap ?? []).length === 0 ? (
            <Empty text="Sem conhecimento consolidado ainda." />
          ) : (
            <div className="space-y-2">
              {d!.knowledgeMap.slice(0, 8).map((k) => {
                const max = Math.max(...d!.knowledgeMap.map((x) => x.count));
                const pct = max ? (k.count / max) * 100 : 0;
                return (
                  <div key={k.category}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{k.category}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {k.count} · {Math.round(k.avg_confidence * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Recent Knowledge + Top Discoveries */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Conhecimentos recentes" icon={<Brain className="h-4 w-4 text-primary" />} description="Últimas peças de conhecimento consolidadas.">
          {q.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : (d?.recentKnowledge ?? []).length === 0 ? (
            <Empty text="Nenhum conhecimento consolidado no período." />
          ) : (
            <ul className="space-y-1.5">
              {d!.recentKnowledge.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{k.category}</Badge>
                      <span className="truncate text-sm font-medium">{k.key}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      Reforçado {k.reinforcement_count}× · {new Date(k.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <ConfidenceRing value={k.confidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Principais descobertas" icon={<Lightbulb className="h-4 w-4 text-primary" />} description="Insights ativos com maior confiança.">
          {q.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : (d?.topDiscoveries ?? []).length === 0 ? (
            <Empty text="O Brain ainda está reunindo evidências." />
          ) : (
            <ul className="space-y-2">
              {d!.topDiscoveries.map((i) => (
                <li key={i.id} className="rounded-lg border border-border/40 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{i.insight_type}</Badge>
                    <span className="text-[10px] text-muted-foreground">conf {Math.round(i.confidence * 100)}%</span>
                  </div>
                  <p className="text-sm leading-snug">{i.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Clientes com mais inteligência" icon={<Users className="h-4 w-4 text-primary" />} description="Ranking por volume de conhecimento acumulado.">
          {q.isLoading ? <Skeleton className="h-40" /> : (d?.smartestClients ?? []).length === 0 ? (
            <Empty text="Sem dados por cliente ainda." />
          ) : (
            <ol className="space-y-1.5">
              {d!.smartestClients.map((c, idx) => (
                <li key={c.client_id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{idx + 1}</span>
                    <span className="truncate">{c.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                    <span>{c.knowledge_count}</span>
                    <span>·</span>
                    <span>{Math.round(c.avg_confidence * 100)}%</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Projetos mais analisados" icon={<TrendingUp className="h-4 w-4 text-primary" />} description="Por volume de eventos capturados.">
          {q.isLoading ? <Skeleton className="h-40" /> : (d?.topProjects ?? []).length === 0 ? (
            <Empty text="Sem atividade em projetos." />
          ) : (
            <ol className="space-y-1.5">
              {d!.topProjects.map((p, idx) => (
                <li key={p.project_id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{idx + 1}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{p.events_count} ev.</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Ranking de módulos" icon={<Activity className="h-4 w-4 text-primary" />} description="Fontes que mais alimentam o Brain.">
          {q.isLoading ? <Skeleton className="h-40" /> : (d?.moduleRanking ?? []).length === 0 ? (
            <Empty text="Sem eventos no período." />
          ) : (
            <ol className="space-y-1.5">
              {d!.moduleRanking.map((m, idx) => {
                const max = Math.max(...d!.moduleRanking.map((x) => x.count));
                const pct = max ? (m.count / max) * 100 : 0;
                return (
                  <li key={m.source_module} className="rounded-md border border-border/40 px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground tabular-nums">{idx + 1}</span>
                        <span className="font-medium">{m.source_module}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">{m.count}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}

function FiltersBar({
  data,
  filters,
  onChange,
}: {
  data: BrainIntelligence | undefined;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5 pl-1 pr-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        Filtros
      </div>
      <FilterSelect
        placeholder="Cliente"
        value={filters.clientId}
        onChange={(v) => onChange({ clientId: v })}
        options={(data?.clientsAvailable ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <FilterSelect
        placeholder="Projeto"
        value={filters.projectId}
        onChange={(v) => onChange({ projectId: v })}
        options={(data?.projectsAvailable ?? []).map((p) => ({ value: p.id, label: p.name }))}
      />
      <FilterSelect
        placeholder="Equipe"
        value={filters.actorId}
        onChange={(v) => onChange({ actorId: v })}
        options={(data?.teamAvailable ?? []).map((t) => ({ value: t.id, label: t.name }))}
      />
      <FilterSelect
        placeholder="Categoria"
        value={filters.category}
        onChange={(v) => onChange({ category: v })}
        options={(data?.categoriesAvailable ?? []).map((c) => ({ value: c, label: c }))}
      />
      <Select value={String(filters.days)} onValueChange={(v) => onChange({ days: Number(v) })}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Últimas 24h</SelectItem>
          <SelectItem value="7">Últimos 7 dias</SelectItem>
          <SelectItem value="14">Últimos 14 dias</SelectItem>
          <SelectItem value="30">Últimos 30 dias</SelectItem>
          <SelectItem value="90">Últimos 90 dias</SelectItem>
        </SelectContent>
      </Select>
      {(filters.clientId || filters.projectId || filters.actorId || filters.category) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onChange({ clientId: null, projectId: null, actorId: null, category: null })}
        >
          Limpar
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger className="h-8 w-[160px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos · {placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Section({
  title,
  description,
  icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border/60 bg-card p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            {icon}
            {title}
          </h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  suffix,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  suffix?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">
          {loading || value === undefined ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <>
              {value.toLocaleString("pt-BR")}
              {suffix ? <span className="ml-0.5 text-base text-muted-foreground">{suffix}</span> : null}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MicroStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {loading || value === undefined ? <Skeleton className="h-6 w-10" /> : value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function ConfidenceRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const deg = pct * 360;
  return (
    <div
      className="relative h-9 w-9 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(var(--primary) ${deg}deg, color-mix(in oklab, var(--muted) 80%, transparent) ${deg}deg)`,
      }}
      aria-label={`Confiança ${Math.round(pct * 100)}%`}
    >
      <div className="absolute inset-1 grid place-items-center rounded-full bg-card text-[10px] font-medium tabular-nums">
        {Math.round(pct * 100)}
      </div>
    </div>
  );
}

function Timeline({ data }: { data: BrainIntelligence["learningTimeline"] }) {
  const { maxEvents, maxInsights } = useMemo(() => {
    let e = 0, i = 0;
    for (const d of data) {
      if (d.events > e) e = d.events;
      if (d.insights > i) i = d.insights;
    }
    return { maxEvents: e || 1, maxInsights: i || 1 };
  }, [data]);

  if (data.length === 0) return <Empty text="Sem eventos no período." />;

  return (
    <div>
      <div className="flex h-40 items-end gap-1">
        {data.map((d) => {
          const eh = (d.events / maxEvents) * 100;
          const ih = (d.insights / maxInsights) * 60;
          return (
            <div key={d.day} className="group relative flex flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-primary/70 transition-all group-hover:bg-primary"
                style={{ height: `${eh}%`, minHeight: d.events ? "2px" : 0 }}
                title={`${d.day}: ${d.events} eventos`}
              />
              <div
                className="mt-0.5 w-full rounded-t bg-[color:var(--chart-4)]/70"
                style={{ height: `${ih}%`, minHeight: d.insights ? "2px" : 0 }}
                title={`${d.day}: ${d.insights} insights`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.day}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-primary/70" />Eventos</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-[color:var(--chart-4)]/70" />Insights</span>
        </div>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}