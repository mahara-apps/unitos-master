import { Sparkline } from "./sparkline";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number | string;
  hint?: string;
  spark?: number[];
  color?: string;
  className?: string;
};

export function KpiCard({ label, value, hint, spark, color, className }: Props) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-4", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {spark && spark.length > 0 && (
          <Sparkline data={spark} className="h-6 w-20" color={color ?? "hsl(var(--primary))"} />
        )}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}