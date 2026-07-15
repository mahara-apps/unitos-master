import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Brain, Sparkles, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { brainStatsFn } from "@/lib/brain-stats.functions";
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

  const weights = useMemo(() => {
    const m = { content: 1, media: 1, messaging: 1, insight: 1 };
    for (const c of stats.data?.categories ?? []) {
      m[c.key] = Math.max(1, c.count24h);
    }
    return m;
  }, [stats.data]);

  return (
    <div className="space-y-6 p-6">
      <NeuralNetworkCanvas weights={weights} lastEvent={lastEvent} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Zap className="h-4 w-4" />}
          label="Eventos (24h)"
          value={stats.isLoading ? undefined : (stats.data?.events24h ?? 0)}
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          label="Total de eventos"
          value={stats.isLoading ? undefined : (stats.data?.totalEvents ?? 0)}
        />
        <Kpi
          icon={<Sparkles className="h-4 w-4" />}
          label="Insights ativos"
          value={stats.isLoading ? undefined : (stats.data?.activeInsights ?? 0)}
        />
        <Kpi
          icon={<Brain className="h-4 w-4" />}
          label="Alimentando a IA"
          value={stats.isLoading ? undefined : (stats.data?.totalEvents ?? 0)}
          hint={brandId ? "eventos desta marca" : "eventos da agência"}
        />
      </div>

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