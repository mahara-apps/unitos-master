import { Sparkles, RotateCw, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getDashboardInsights } from "@/lib/dashboard.functions";

export function InsightsPanel({ brandId, clientId }: { brandId: string; clientId: string | null }) {
  const fetchInsights = useServerFn(getDashboardInsights);
  const key = ["insights", brandId, clientId ?? "agency"];
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchInsights({ data: { brandId, clientId } }),
    staleTime: 5 * 60 * 1000,
  });
  const regen = useMutation({ mutationFn: () => fetchInsights({ data: { brandId, clientId } }), onSuccess: (d) => query.refetch() });

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 via-card to-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Insights com IA</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => regen.mutate()}
          disabled={query.isFetching || regen.isPending}
        >
          <RotateCw className={"h-3.5 w-3.5 " + ((query.isFetching || regen.isPending) ? "animate-spin" : "")} />
          Regenerar
        </Button>
      </div>
      {query.isLoading ? (
        <div className="mt-3 space-y-2">
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
        </div>
      ) : query.data ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-medium leading-snug text-foreground">{query.data.headline}</p>
          <ul className="space-y-2">
            {query.data.actions.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background/50 p-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.why}</div>
                </div>
                {a.href && (
                  <Link to={a.href} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Abrir <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {query.data.risks.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Riscos</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {query.data.risks.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">Insights indisponíveis no momento.</div>
      )}
    </div>
  );
}