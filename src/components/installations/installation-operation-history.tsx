import type { ReactNode } from "react";

import type { InstallationOperationRecord } from "@/lib/installation/manager.functions";
import {
  OPERATION_KIND_LABEL,
  attemptPresentationState,
} from "@/lib/installation/manager-contract";
import { formatDateTimeBr } from "@/lib/timezone";
import { Badge } from "@/components/ui/badge";
import { OperationStatusBadge } from "./operation-views";

export function InstallationOperationHistory({
  operations,
  renderActions,
}: {
  operations: InstallationOperationRecord[];
  renderActions?: (operation: InstallationOperationRecord) => ReactNode;
}) {
  if (operations.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma operação registrada.</p>;
  }

  return (
    <div className="space-y-2">
      {operations.map((operation) => (
        <div key={operation.id} className="rounded-lg border border-border/60 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{OPERATION_KIND_LABEL[operation.kind]}</span>
            <OperationStatusBadge status={operation.status} />
            {operation.detail.releaseVersion && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {operation.detail.releaseVersion}
              </span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {formatDateTimeBr(operation.startedAt)}
              {operation.finishedAt ? ` → ${formatDateTimeBr(operation.finishedAt)}` : ""}
            </span>
          </div>
          {operation.summary && (
            <p className="mt-1 text-xs text-muted-foreground">{operation.summary}</p>
          )}
          {operation.errorKind && (
            <p className="mt-1 text-xs text-destructive">Motivo: {operation.errorKind}</p>
          )}
          {operation.checkpoints.length > 0 && (
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
              checkpoint {operation.checkpoints[0]?.migrationFile || "indeterminado"} · comando{" "}
              {operation.checkpoints[0]?.statementIndex ?? 0}/
              {operation.checkpoints[0]?.totalStatements ?? "—"}
            </p>
          )}
          {operation.attempts.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
              {operation.attempts.map((attempt) => {
                const state = attemptPresentationState(attempt.status);
                return (
                  <div
                    key={attempt.id}
                    className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
                  >
                    <span className="font-mono">tentativa {attempt.attemptNumber}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {state === "indeterminate"
                        ? `indeterminado (${attempt.status})`
                        : attempt.status}
                    </Badge>
                    <span>fencing {attempt.fencingToken}</span>
                    <span className="ml-auto">
                      {formatDateTimeBr(
                        attempt.finishedAt ?? attempt.heartbeatAt ?? attempt.startedAt,
                      )}
                    </span>
                    {(attempt.errorMessage || attempt.errorKind) && (
                      <span className="w-full text-destructive">
                        {attempt.errorMessage ?? attempt.errorKind}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {renderActions?.(operation)}
        </div>
      ))}
    </div>
  );
}
