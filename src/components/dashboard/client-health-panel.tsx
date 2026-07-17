import { HealthBar } from "@/components/dashboard/health-bar";
import { cn } from "@/lib/utils";
import type { ClientHealthBreakdown } from "@/lib/client-health";

type Props = {
  score: number;
  breakdown: ClientHealthBreakdown;
  title?: string;
  subtitle?: string;
  className?: string;
};

export function ClientHealthPanel({
  score,
  breakdown,
  title = "Saúde do cliente",
  subtitle = "Score ponderado — pontualidade, aprovações, briefing e agenda",
  className,
}: Props) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {title}
          </div>
          <div className="mt-0.5 text-sm font-medium">{subtitle}</div>
        </div>
        <span className="font-mono text-2xl font-semibold tabular-nums">{score}%</span>
      </div>
      <HealthBar score={score} className="mt-3" />
      <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] sm:grid-cols-4">
        <HealthCell label="Pontualidade" value={breakdown.onTime} max={40} />
        <HealthCell label="Aprovações" value={breakdown.approvals} max={30} />
        <HealthCell label="Briefing" value={breakdown.briefing} max={15} />
        <HealthCell label="Agenda" value={breakdown.schedule} max={15} />
      </div>
    </div>
  );
}

function HealthCell({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}