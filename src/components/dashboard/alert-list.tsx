import { AlertTriangle, Info, ShieldAlert, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { AgencyAlert } from "@/lib/dashboard.functions";
import { cn } from "@/lib/utils";

const icon = {
  info: Info,
  warning: AlertTriangle,
  critical: ShieldAlert,
} as const;

const tone: Record<AgencyAlert["severity"], string> = {
  info: "border-[color:var(--color-severity-info)]/40 bg-[color:var(--color-severity-info)]/5 text-[color:var(--color-severity-info)]",
  warning: "border-[color:var(--color-severity-warning)]/40 bg-[color:var(--color-severity-warning)]/5 text-[color:var(--color-severity-warning)]",
  critical: "border-[color:var(--color-severity-critical)]/40 bg-[color:var(--color-severity-critical)]/5 text-[color:var(--color-severity-critical)]",
};

export function AlertList({ alerts }: { alerts: AgencyAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
        Tudo em ordem. Nenhum alerta crítico.
      </div>
    );
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {alerts.map((a) => {
        const Ico = icon[a.severity];
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-start justify-between gap-3 rounded-xl border p-4",
              tone[a.severity],
            )}
          >
            <div className="flex items-start gap-3">
              <Ico className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="text-sm font-medium text-foreground">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.description}</div>
              </div>
            </div>
            {a.href && (
              <Link
                to={a.href}
                className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
              >
                Ver <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}