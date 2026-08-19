import { Activity } from "lucide-react";
import { HealthBar } from "@/components/dashboard/health-bar";
import { PageKpi, PageKpiGrid, type KpiStatus } from "@/components/ui/page-kpi";
import { OverviewCard } from "./overview-shared";


export function OverviewSummary({
  health,
  breakdown,
  totalTasks,
  overdueTasks,
  contentTotal,
  briefingCompletion,
}: {
  health: number;
  breakdown: { onTime: number; approvals: number; briefing: number; schedule: number };
  totalTasks: number;
  overdueTasks: number;
  contentTotal: number;
  briefingCompletion: number | null;
}) {
  const tone =
    health >= 75
      ? "text-emerald-400"
      : health >= 50
        ? "text-amber-400"
        : "text-destructive";

  const stats = [
    { label: "Tarefas", value: totalTasks },
    { label: "Atrasadas", value: overdueTasks, alert: overdueTasks > 0 },
    { label: "Conteúdos", value: contentTotal },
    {
      label: "Briefing",
      value: briefingCompletion === null ? "—" : `${briefingCompletion}%`,
    },
  ];

  return (
    <OverviewCard
      title="Resumo operacional"
      subtitle="Situação atual da conta"
      icon={<Activity className="h-4 w-4" />}
    >
      <div className="flex h-full flex-col justify-between gap-5">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Saúde do cliente
              </div>
              <div className={`mt-1 text-4xl font-semibold tabular-nums ${tone}`}>{health}%</div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Prazos {breakdown.onTime}/40</span>
              <span>Aprovações {breakdown.approvals}/30</span>
              <span>Briefing {breakdown.briefing}/15</span>
              <span>Agenda {breakdown.schedule}/15</span>
            </div>
          </div>
          <HealthBar score={health} className="mt-3" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-muted/30 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div
                className={`mt-0.5 text-xl font-semibold tabular-nums ${
                  s.alert ? "text-amber-400" : ""
                }`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </OverviewCard>
  );
}
