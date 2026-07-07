import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { loadClientContextFn } from "@/lib/ai-agents.functions";

export const Route = createFileRoute("/_authenticated/app/clients/$clientId/")({
  component: ClientOverview,
});

const STEPS = [
  { key: "briefing" as const, label: "Briefing", to: "/app/clients/$clientId/briefing" as const },
  { key: "voice" as const, label: "Voice Card", to: "/app/clients/$clientId/voice" as const },
  { key: "personas" as const, label: "Personas", to: "/app/clients/$clientId/personas" as const },
  { key: "cohorts" as const, label: "Cohorts", to: "/app/clients/$clientId/cohorts" as const },
  { key: "swot" as const, label: "SWOT", to: "/app/clients/$clientId/swot" as const },
];

function ClientOverview() {
  const { clientId } = Route.useParams();
  const { brandId } = useActiveContext();
  const load = useServerFn(loadClientContextFn);
  const ctxQ = useQuery({
    queryKey: ["client-ai-context", brandId, clientId],
    queryFn: () => load({ data: { brandId: brandId!, clientId } }),
    enabled: !!brandId,
  });
  const ctx = ctxQ.data;
  const cost = ctx?.usage.totalCostUsd ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
          <DollarSign className="mr-1 h-3 w-3" />
          {cost.toFixed(4)} USD · 30d
        </Badge>
        <Badge variant="outline" className="border-white/10 bg-white/5 font-mono text-[10px]">
          {ctx?.usage.last30d.length ?? 0} chamadas
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {STEPS.map((s) => {
          const done = ctx ? Boolean(ctx[s.key]) : false;
          return (
            <Link
              key={s.key}
              to={s.to}
              params={{ clientId }}
              className="group flex items-center justify-between rounded-xl border border-white/10 bg-neutral-950/60 p-4 transition hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {done ? "gerado — abrir para editar/regerar" : "pendente"}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Pauta, Copy e Concorrentes dependem dos artefatos acima. Rode-os na ordem para melhor resultado.
      </p>
    </div>
  );
}