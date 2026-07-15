import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * KPI card used across Settings screens.
 * Mirrors the Dashboard's `KpiCard` primitive: flat surface, top accent bar,
 * mono uppercase label, dense typography — no drop shadows.
 */
const TONE_BAR: Record<string, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  sky: "bg-sky-500",
  neutral: "bg-foreground/40",
};

export function SettingsStatCard({
  label,
  value,
  hint,
  icon,
  className,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
  tone?: keyof typeof TONE_BAR;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-4">
      <span className={cn("absolute inset-x-0 top-0 h-0.5", TONE_BAR[tone] ?? TONE_BAR.neutral)} />
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {icon ? <span className="text-muted-foreground/80">{icon}</span> : null}
          {label}
        </span>
      </div>
      <div className={cn("mt-3 text-2xl font-semibold tabular-nums tracking-tight leading-none", className)}>
        {value}
      </div>
      {hint ? <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}