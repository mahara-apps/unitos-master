import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Brain, Sparkles, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { brainStatsFn } from "@/lib/brain-stats.functions";
import { brainInfraSummaryFn, type BrainInfraSummary } from "@/lib/brain-infra.functions";
import { NeuralNetworkCanvas } from "./neural-network-canvas";
import { useBrainStream } from "@/hooks/use-brain-stream";

export function BrainDashboard({ brandId }: { brandId?: string | null }) {
  const fetchStats = useServerFn(brainStatsFn);
  const stats = useQuery({
    queryKey: ["brain-stats", brandId ?? "all"],
    queryFn: () => fetchStats({ data: { brandId: brandId ?? null } }),
    refetchInterval: 30_000,
  });
  const lastEvent = useBrainStream(brandId ?? null);

  const fetchInfra = useServerFn(brainInfraSummaryFn);
  const infra = useQuery({
    queryKey: ["brain-infra", brandId ?? "all"],
    queryFn: () => fetchInfra({ data: { brandId: brandId ?? null } }),
    refetchInterval: 60_000,
  });

  const weights = useMemo(() => {
    const m = { content: 1, media: 1, messaging: 1, insight: 1 };
    for (const c of stats.data?.categories ?? []) {
      m[c.key] = Math.max(1, c.count24h);
    }
    return m;
  }, [stats.data]);

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Rede neural</CardTitle>
            <CardDescription>
              Cada evento do sistema alimenta um nó — clusters crescem conforme a atividade.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            {brandId ? "Marca" : "Agência"}
          </Badge>
        </CardHeader>
        <CardContent>
          <NeuralNetworkCanvas weights={weights} lastEvent={lastEvent} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Zap className="h-4 w-4 text-primary" />}
          label="Eventos (24h)"
          value={stats.isLoading ? undefined : (stats.data?.events24h ?? 0)}
        />
        <Kpi
          icon={<Activity className="h-4 w-4" style={{ color: "var(--chart-2)" }} />}
          label="Total de eventos"
          value={stats.isLoading ? undefined : (stats.data?.totalEvents ?? 0)}
        />
        <Kpi
          icon={<Sparkles className="h-4 w-4" style={{ color: "var(--chart-4)" }} />}
          label="Insights ativos"
          value={stats.isLoading ? undefined : (stats.data?.activeInsights ?? 0)}
        />
        <Kpi
          icon={<Brain className="h-4 w-4 text-muted-foreground" />}
          label="Alimentando a IA"
          value={stats.isLoading ? undefined : (stats.data?.totalEvents ?? 0)}
          hint={brandId ? "eventos desta marca" : "eventos da agência"}
        />
      </div>

      <section className="rounded-xl border border-border/60 bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Arquitetura do Brain</h3>
            <p className="text-xs text-muted-foreground">
              Camadas de infraestrutura que alimentam toda a inteligência da plataforma.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            Infra
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {[
            { k: "events", label: "Eventos" },
            { k: "knowledge", label: "Conhecimento" },
            { k: "insights", label: "Insights" },
            { k: "recommendations", label: "Recomendações" },
            { k: "memory", label: "Memória" },
            { k: "relationships", label: "Relações" },
          ].map((row) => (
            <div key={row.k} className="rounded-lg border border-border/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {row.label}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {infra.isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  (infra.data?.counts[row.k as keyof typeof infra.data.counts] ?? 0).toLocaleString("pt-BR")
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Event bus (últimos)
            </h4>
            {infra.isLoading ? (
              <Skeleton className="h-24" />
            ) : (infra.data?.recentEvents ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem eventos registrados ainda.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto pr-1">
                {infra.data!.recentEvents.slice(0, 15).map((e: BrainInfraSummary["recentEvents"][number]) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/30 px-2 py-1.5 text-[11px]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="text-[9px]">
                        {e.source_module}
                      </Badge>
                      <span className="truncate font-mono text-muted-foreground">
                        {e.event_type}
                      </span>
                      {e.action ? (
                        <span className="shrink-0 text-[9px] text-muted-foreground">
                          · {e.action}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {e.confidence != null ? (
                        <span className="text-[9px] text-muted-foreground">
                          {Math.round(Number(e.confidence) * 100)}%
                        </span>
                      ) : null}
                      <time className="text-[9px] text-muted-foreground">
                        {new Date(e.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recomendações pendentes
            </h4>
            {infra.isLoading ? (
              <Skeleton className="h-24" />
            ) : (infra.data?.topRecommendations ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma recomendação — a camada está pronta para ser alimentada por futuros motores.
              </p>
            ) : (
              <ul className="space-y-2">
                {infra.data!.topRecommendations.map((r: BrainInfraSummary["topRecommendations"][number]) => (
                  <li key={r.id} className="rounded-md border border-border/40 p-2.5">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {r.priority}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(Number(r.confidence) * 100)}%
                      </span>
                    </div>
                    <p className="text-xs font-medium leading-snug">{r.title}</p>
                    {r.description ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{r.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border/60 bg-card p-5">
          <h3 className="mb-3 text-sm font-medium">Insights ativos</h3>
          {stats.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : (stats.data?.insights ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              O Brain ainda está aprendendo. Insights aparecem após a consolidação diária.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.data!.insights.map((i) => (
                <li key={i.id} className="rounded-lg border border-border/40 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {i.insight_type}
                    </Badge>
                    {i.confidence != null ? (
                      <span className="text-[10px] text-muted-foreground">
                        conf {Math.round(i.confidence * 100)}%
                      </span>
                    ) : null}
                    {i.brand_id === null ? (
                      <Badge variant="outline" className="text-[10px]">
                        agência
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm leading-snug">{i.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-card p-5">
          <h3 className="mb-3 text-sm font-medium">Timeline recente</h3>
          {stats.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (stats.data?.recent ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento nas últimas 24h.
            </p>
          ) : (
            <ul className="max-h-[420px] space-y-1.5 overflow-auto pr-1">
              {stats.data!.recent.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/30 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {e.source_module}
                    </Badge>
                    <span className="truncate text-muted-foreground">{e.event_type}</span>
                  </div>
                  <time className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">
          {value === undefined ? <Skeleton className="h-7 w-16" /> : value.toLocaleString("pt-BR")}
        </div>
        {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}