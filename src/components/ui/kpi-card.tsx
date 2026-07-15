import { forwardRef, type ReactNode } from "react";

import { Sparkline } from "@/components/dashboard/sparkline";
import { cn } from "@/lib/utils";

export const KPI_TONES = {
  emerald: { accent: "text-emerald-500", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  amber: { accent: "text-amber-500", bar: "bg-amber-500", dot: "bg-amber-500" },
  rose: { accent: "text-rose-500", bar: "bg-rose-500", dot: "bg-rose-500" },
  violet: { accent: "text-violet-500", bar: "bg-violet-500", dot: "bg-violet-500" },
  sky: { accent: "text-sky-500", bar: "bg-sky-500", dot: "bg-sky-500" },
  pink: { accent: "text-pink-500", bar: "bg-pink-500", dot: "bg-pink-500" },
  neutral: { accent: "text-foreground", bar: "bg-foreground/40", dot: "bg-foreground/60" },
} as const;

export type KpiTone = keyof typeof KPI_TONES;

export type KpiCardProps = {
  icon?: ReactNode;
  label: string;
  value: number | string;
  sub?: ReactNode;
  tone?: KpiTone;
  spark?: number[];
  onClick?: () => void;
  active?: boolean;
  dimmed?: boolean;
  trailing?: ReactNode;
  className?: string;
};

/**
 * Canonical KPI card used across the app.
 * Extracted from the Dashboard reference — do not duplicate this layout locally.
 */
export const KpiCard = forwardRef<HTMLDivElement | HTMLButtonElement, KpiCardProps>(
  function KpiCard(
    { icon, label, value, sub, tone = "neutral", spark, onClick, active, dimmed, trailing, className },
    ref,
  ) {
    const t = KPI_TONES[tone];
    const base = cn(
      "relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 text-left transition-all",
      onClick && "group hover:border-foreground/20 hover:-translate-y-px",
      active && "border-foreground/40 ring-2 ring-foreground/10 shadow-sm",
      dimmed && "opacity-60",
      className,
    );

    const inner = (
      <>
        <span className={cn("absolute inset-x-0 top-0 h-0.5", t.bar)} />
        <div className="flex items-start justify-between gap-2">
          {icon ? (
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-background/60",
                t.accent,
              )}
            >
              {icon}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", t.dot)} />
              {label}
            </span>
          )}
          {spark && spark.some((v) => v > 0) ? (
            <Sparkline data={spark} className={cn("h-6 w-20", t.accent)} />
          ) : trailing ? (
            <span className="text-[9px] font-semibold uppercase tracking-widest text-foreground/70">
              {trailing}
            </span>
          ) : null}
        </div>
        <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {icon ? (
          <div className="mt-0.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
        ) : null}
        {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
      </>
    );

    if (onClick) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={base}
        >
          {inner}
        </button>
      );
    }
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={base}>
        {inner}
      </div>
    );
  },
);