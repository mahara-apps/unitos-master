import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brainGraphFn, type BrainGraph, type GraphNode } from "@/lib/brain/api";
import { RefreshCw } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  client: "var(--chart-1)",
  project: "var(--chart-2)",
  post: "var(--chart-3)",
  task: "var(--chart-4)",
  user: "var(--chart-5)",
  document: "hsl(210 70% 55%)",
  comment: "hsl(280 60% 60%)",
  approval: "hsl(150 60% 50%)",
  brand: "hsl(35 90% 55%)",
};

const TYPE_ORDER = [
  "client",
  "project",
  "post",
  "task",
  "user",
  "document",
  "comment",
  "approval",
  "brand",
];

function colorFor(type: string) {
  return TYPE_COLORS[type] ?? "hsl(0 0% 60%)";
}

type Positioned = GraphNode & { x: number; y: number };

function layout(nodes: GraphNode[], w: number, h: number): Map<string, Positioned> {
  const byType = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    byType.get(n.type)!.push(n);
  }
  const types = [...byType.keys()].sort(
    (a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b),
  );
  const cx = w / 2;
  const cy = h / 2;
  const clusterR = Math.min(w, h) * 0.38;
  const pos = new Map<string, Positioned>();
  types.forEach((t, i) => {
    const clusterAngle = (i / Math.max(1, types.length)) * Math.PI * 2;
    const clusterCx = cx + Math.cos(clusterAngle) * clusterR;
    const clusterCy = cy + Math.sin(clusterAngle) * clusterR;
    const list = byType.get(t)!;
    const localR = Math.min(90, 20 + list.length * 4);
    list.forEach((n, j) => {
      const a = (j / Math.max(1, list.length)) * Math.PI * 2;
      pos.set(`${n.type}:${n.id}`, {
        ...n,
        x: clusterCx + Math.cos(a) * localR,
        y: clusterCy + Math.sin(a) * localR,
      });
    });
  });
  return pos;
}

export function KnowledgeGraph({ brandId }: { brandId: string | null }) {
  const fetchGraph = useServerFn(brainGraphFn);
  const [limit, setLimit] = useState(300);
  const [hover, setHover] = useState<Positioned | null>(null);

  const graph = useQuery({
    queryKey: ["brain-graph", brandId ?? "all", limit],
    queryFn: () => fetchGraph({ data: { brandId: brandId ?? null, limit } }),
    refetchInterval: 60_000,
  });

  const width = 900;
  const height = 560;
  const positioned = useMemo(
    () => layout(graph.data?.nodes ?? [], width, height),
    [graph.data?.nodes],
  );

  const legend = useMemo(() => {
    const t = graph.data?.stats.typeCounts ?? {};
    return Object.entries(t).sort(
      ([a], [b]) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b),
    );
  }, [graph.data?.stats.typeCounts]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Knowledge Graph</CardTitle>
          <CardDescription>
            Cada nó é uma entidade real; cada aresta é uma relação inferida pelo Learning Engine.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
          >
            <option value={150}>150 arestas</option>
            <option value={300}>300 arestas</option>
            <option value={600}>600 arestas</option>
            <option value={1200}>1200 arestas</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => graph.refetch()}
            disabled={graph.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${graph.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          <Stat label="Nós" value={graph.data?.stats.nodeCount} loading={graph.isLoading} />
          <Stat label="Arestas" value={graph.data?.stats.edgeCount} loading={graph.isLoading} />
          {legend.slice(0, 4).map(([t, c]) => (
            <Stat key={t} label={t} value={c} loading={graph.isLoading} dotColor={colorFor(t)} />
          ))}
        </div>

        <div className="relative overflow-hidden rounded-lg border border-border/50 bg-muted/20">
          {graph.isLoading ? (
            <Skeleton className="h-[560px] w-full" />
          ) : (graph.data?.edges.length ?? 0) === 0 ? (
            <div className="flex h-[560px] items-center justify-center px-8 text-center text-sm text-muted-foreground">
              O grafo ainda está vazio. Assim que o Learning Engine processar eventos com atores,
              clientes ou projetos, as relações aparecerão aqui automaticamente.
            </div>
          ) : (
            <svg viewBox={`0 0 ${width} ${height}`} className="h-[560px] w-full">
              <g>
                {(graph.data?.edges ?? []).map((e) => {
                  const a = positioned.get(`${e.from.type}:${e.from.id}`);
                  const b = positioned.get(`${e.to.type}:${e.to.id}`);
                  if (!a || !b) return null;
                  const s = Math.max(0.1, Math.min(1, Number(e.strength)));
                  return (
                    <line
                      key={e.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="currentColor"
                      className="text-border"
                      strokeOpacity={0.15 + s * 0.55}
                      strokeWidth={0.5 + s * 1.5}
                    />
                  );
                })}
              </g>
              <g>
                {[...positioned.values()].map((n) => (
                  <g
                    key={`${n.type}:${n.id}`}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover((h) => (h?.id === n.id ? null : h))}
                    style={{ cursor: "pointer" }}
                  >
                    <circle cx={n.x} cy={n.y} r={5} fill={colorFor(n.type)} />
                  </g>
                ))}
              </g>
              {hover ? (
                <g pointerEvents="none">
                  <rect
                    x={Math.min(width - 210, hover.x + 10)}
                    y={Math.max(0, hover.y - 32)}
                    width={200}
                    height={40}
                    rx={6}
                    className="fill-background stroke-border"
                    strokeWidth={1}
                  />
                  <text
                    x={Math.min(width - 210, hover.x + 10) + 8}
                    y={Math.max(0, hover.y - 32) + 16}
                    className="fill-foreground"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {hover.label.slice(0, 28)}
                  </text>
                  <text
                    x={Math.min(width - 210, hover.x + 10) + 8}
                    y={Math.max(0, hover.y - 32) + 30}
                    className="fill-muted-foreground"
                    style={{ fontSize: 10 }}
                  >
                    {hover.type}
                  </text>
                </g>
              ) : null}
            </svg>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {legend.map(([t, c]) => (
            <Badge key={t} variant="outline" className="gap-1.5 text-[10px]">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colorFor(t) }}
              />
              {t} · {c}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  loading,
  dotColor,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  dotColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {dotColor ? (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
        ) : null}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {loading || value === undefined ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          value.toLocaleString("pt-BR")
        )}
      </div>
    </div>
  );
}