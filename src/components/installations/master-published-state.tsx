import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";

import {
  masterPublicationState,
  type MasterPublishedSnapshot,
} from "@/lib/installation/manager-contract";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MasterPublishedState({
  snapshot,
  pending = false,
  compact = false,
}: {
  snapshot?: MasterPublishedSnapshot | null;
  pending?: boolean;
  compact?: boolean;
}) {
  const state = pending ? "indeterminate" : masterPublicationState(snapshot);
  const Icon =
    state === "confirmed" ? CheckCircle2 : state === "divergent" ? AlertTriangle : CircleHelp;
  const label =
    state === "confirmed" ? "Publicado" : state === "divergent" ? "Divergente" : "Indeterminado";
  const tone =
    state === "confirmed"
      ? "border-health-good/40 text-health-good"
      : state === "divergent"
        ? "border-severity-warning/40 text-severity-warning"
        : "border-muted-foreground/30 text-muted-foreground";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        !compact && "rounded-md border border-border/60 p-3",
      )}
    >
      <Badge variant="outline" className={cn("gap-1 text-[10px]", tone)}>
        <Icon className="h-3 w-3" /> {label}
      </Badge>
      <span className="font-mono text-[11px] text-muted-foreground">
        local {snapshot?.release ?? "—"} · publicado{" "}
        {pending ? "consultando…" : (snapshot?.repoRelease ?? "—")}
        {snapshot?.commitSha ? ` · ${snapshot.commitSha.slice(0, 7)}` : ""}
      </span>
      {!compact && state === "indeterminate" && (
        <p className="w-full text-xs text-muted-foreground">
          {snapshot?.repoReleaseError ??
            snapshot?.error ??
            "Não há evidência suficiente da publicação."}
        </p>
      )}
    </div>
  );
}
