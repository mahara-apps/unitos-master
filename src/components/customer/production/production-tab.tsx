// Aba "Produção" do perfil do cliente: resumo do mês, relatório filtrável
// do que foi produzido e a fila de solicitações extras / excedentes.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { getPlanVolumetryFn } from "@/lib/monthly-plans.functions";
import { ProductionReport } from "./production-report";
import { ProductionOverages } from "./production-overages";

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber" ? "text-amber-500" : tone === "emerald" ? "text-emerald-500" : "text-foreground";
  return (
    <DashboardPanelSurface className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </DashboardPanelSurface>
  );
}

export function ProductionTab({ brandId, clientId }: { brandId: string; clientId: string }) {
  const loadVolumetry = useServerFn(getPlanVolumetryFn);
  const volQ = useQuery({
    queryKey: ["monthly-plan", "volumetry", clientId],
    queryFn: () => loadVolumetry({ data: { clientId } }),
    staleTime: 30_000,
  });

  const vol = volQ.data;
  const quotaByChannel = (vol?.monthlyQuota ?? {}) as Record<string, number>;
  const overageTotal = Object.values(vol?.approvedOverage ?? {}).reduce(
    (s, n) => s + (Number(n) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Previstas no mês"
          value={vol ? vol.totalTarget : "—"}
          hint="Volumetria do briefing"
        />
        <StatCard
          label="Geradas na pauta"
          value={vol ? vol.generatedTotal : "—"}
          hint="Mês corrente"
        />
        <StatCard
          label="Excedentes autorizados"
          value={vol ? overageTotal : "—"}
          hint="Liberados pelo gestor"
          tone={overageTotal > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Cotas por canal"
          value={Object.keys(quotaByChannel).length}
          hint="Canais com volumetria definida"
        />
      </div>

      <ProductionReport brandId={brandId} clientId={clientId} quotaByChannel={quotaByChannel} />
      <ProductionOverages brandId={brandId} clientId={clientId} />
    </div>
  );
}
