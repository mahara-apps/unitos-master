import { Card, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsStatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <p className={cn("text-2xl font-semibold tabular-nums leading-tight mt-1", className)}>
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}