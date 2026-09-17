import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SettingsPageState({
  title,
  description,
  kind = "empty",
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  description: string;
  kind?: "empty" | "error";
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const Icon = kind === "error" ? AlertTriangle : Inbox;

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <Icon
        className={cn("h-5 w-5", kind === "error" ? "text-destructive" : "text-muted-foreground")}
      />
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button type="button" size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SettingsLoadingState({ label = "Carregando…" }: { label?: ReactNode }) {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}
