import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PLAN_CHANNELS,
  PLAN_CHANNEL_LABEL,
  type PlanChannel,
  type VolumetryBasis,
} from "@/lib/monthly-plan-fields";

export type PlanVolumetry = {
  weekly: Record<string, number>;
  monthlyQuota: Record<string, number>;
  volumetryBasis?: VolumetryBasis;
  totalTarget: number;
  hasBriefing: boolean;
  formatsByChannel: Record<string, string[]>;
  /** Cota mensal por canal → formato canônico. */
  formatQuota?: Record<string, Partial<Record<ContentFormat, number>>>;
  generatedThisMonth: Record<string, number>;
  generatedTotal: number;
  /** Excedentes autorizados pelo gestor no mês corrente, por canal. */
  approvedOverage?: Record<string, number>;
};

function MetricCard({
  label,
  sub,
  quota,
  generated,
  emphasis,
}: {
  label: string;
  sub?: string;
  quota: number;
  generated: number;
  emphasis?: boolean;
}) {
  const available = Math.max(0, quota - generated);
  const pct = quota > 0 ? Math.min(100, Math.round((generated / quota) * 100)) : 0;
  return (
    <Card className={emphasis ? "border-emerald-500/30 bg-emerald-500/5" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="text-lg font-semibold tabular-nums">{quota}</span>
        </div>
        {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
        <div className="space-y-1.5">
          <Progress
            value={pct}
            className={`h-1.5${emphasis ? " bg-emerald-500/20 [&>div]:bg-emerald-500" : ""}`}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">{generated} gerados</span>
            <span className="font-medium tabular-nums text-foreground">
              {available} disponíveis
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function VolumetryCards({
  volumetry,
  loading,
}: {
  volumetry: PlanVolumetry | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const channels = PLAN_CHANNELS.filter((c) => (volumetry?.monthlyQuota[c] ?? 0) > 0);

  if (!volumetry || channels.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-400">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Volumetria não definida.</p>
          <p className="mt-0.5">
            Defina quantas peças por semana (ou por mês) em cada canal no briefing do cliente (aba Briefing →
            Metas de publicação) para gerar a pauta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        emphasis
        label="Total do cliente"
        sub="Soma das cotas mensais"
        quota={
          volumetry.totalTarget +
          Object.values(volumetry.approvedOverage ?? {}).reduce((a, b) => a + (b || 0), 0)
        }
        generated={volumetry.generatedTotal}
      />
      {channels.map((c: PlanChannel) => (
        <MetricCard
          key={c}
          label={PLAN_CHANNEL_LABEL[c]}
          sub={`${
            volumetry.volumetryBasis === "monthly"
              ? `${volumetry.monthlyQuota[c] ?? 0}/mês (base mensal)`
              : `${volumetry.weekly[c] ?? 0}/semana · ${volumetry.monthlyQuota[c] ?? 0}/mês`
          }${
            (volumetry.approvedOverage?.[c] ?? 0) > 0
              ? ` · +${volumetry.approvedOverage?.[c]} extra`
              : ""
          }`}
          quota={(volumetry.monthlyQuota[c] ?? 0) + (volumetry.approvedOverage?.[c] ?? 0)}
          generated={volumetry.generatedThisMonth[c] ?? 0}
        />
      ))}
    </div>
  );
}
