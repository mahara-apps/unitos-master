import { RefreshCw, XCircle } from "lucide-react";

import type { InstallationOperationRecord } from "@/lib/installation/manager.functions";
import { formatDateTimeBr } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { LiveOperationBar } from "./operation-views";

export function InstallationOperationPanel({
  operation,
  restarting,
  cancelling,
  onRestart,
  onCancel,
}: {
  operation: InstallationOperationRecord;
  restarting: boolean;
  cancelling: boolean;
  onRestart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <LiveOperationBar
        status={operation.status}
        kind={operation.kind}
        percent={operation.progress.percent}
        done={operation.progress.done}
        total={operation.progress.total}
        steps={operation.steps}
        startedAt={operation.startedAt}
        finishedAt={operation.finishedAt}
        lastReportAt={operation.lastReportAt}
        errorKind={operation.errorKind}
        currentStep={operation.currentStep}
        migrationFile={operation.migrationFile}
        migrationPosition={operation.migrationPosition}
        migrationStatement={operation.migrationStatement}
        migrationStatementsTotal={operation.migrationStatementsTotal}
        summary={operation.summary}
      >
        <Button size="sm" variant="outline" disabled={restarting} onClick={onRestart}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reiniciar
        </Button>
        <Button size="sm" variant="ghost" disabled={cancelling} onClick={onCancel}>
          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancelar
        </Button>
      </LiveOperationBar>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 font-mono text-[10px] text-muted-foreground">
        <span>workflow {operation.workflowVersion ?? "—"}</span>
        <span>tentativas {operation.attemptCount}</span>
        <span>fencing {operation.fencingToken}</span>
        <span>
          lease{" "}
          {operation.hasLease ? `até ${formatDateTimeBr(operation.leaseExpiresAt)}` : "ausente"}
        </span>
        <span>heartbeat {formatDateTimeBr(operation.heartbeatAt ?? operation.lastReportAt)}</span>
        {operation.nextAttemptAt && (
          <span>próxima {formatDateTimeBr(operation.nextAttemptAt)}</span>
        )}
      </div>
    </div>
  );
}
