import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listTimeEntriesFn,
  getMyActiveTimerFn,
  startTimerFn,
  stopTimerFn,
  formatMinutes,
  type TimeEntry,
} from "@/lib/timesheet.functions";

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function pausedKey(taskId: string) {
  return `unitos.timesheet.paused.${taskId}`;
}
function readPaused(taskId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(pausedKey(taskId)) === "1";
  } catch {
    return false;
  }
}
function writePaused(taskId: string, v: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (v) window.localStorage.setItem(pausedKey(taskId), "1");
    else window.localStorage.removeItem(pausedKey(taskId));
  } catch {
    /* ignore */
  }
}

function useElapsedSeconds(startedAt: string | null): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

type Props = {
  brandId: string;
  taskId: string;
  estimatedMinutes?: number | null;
  compact?: boolean;
};

/**
 * Play · Pause · Stop timer for a task.
 * - Play  → startTimerFn (novo segmento em task_time_entries)
 * - Pause → stopTimerFn  + flag paused=true no localStorage (retomável)
 * - Stop  → stopTimerFn  + limpa flag (encerra a sessão)
 * Total = soma dos segmentos + tempo corrido do segmento ativo.
 */
export function TaskTimerWidget({ brandId, taskId, estimatedMinutes, compact }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTimeEntriesFn);
  const activeFn = useServerFn(getMyActiveTimerFn);
  const startFn = useServerFn(startTimerFn);
  const stopFn = useServerFn(stopTimerFn);

  const entriesQ = useQuery({
    queryKey: ["time-entries", brandId, taskId],
    queryFn: () => listFn({ data: { brandId, taskId } }),
    enabled: !!brandId && !!taskId,
  });
  const activeQ = useQuery({
    queryKey: ["active-timer", brandId],
    queryFn: () => activeFn({ data: { brandId } }),
    enabled: !!brandId,
    refetchInterval: 30_000,
  });

  const active = activeQ.data;
  const runningHere = active?.task_id === taskId;
  const elapsedSec = useElapsedSeconds(runningHere ? active!.started_at : null);

  const [paused, setPaused] = useState(false);
  useEffect(() => {
    setPaused(readPaused(taskId));
  }, [taskId]);
  // Se algo já está rodando aqui, não é pausado.
  useEffect(() => {
    if (runningHere && paused) {
      setPaused(false);
      writePaused(taskId, false);
    }
  }, [runningHere, paused, taskId]);

  const entries: TimeEntry[] = entriesQ.data ?? [];
  const totalSavedMin = entries.reduce((sum, e) => sum + (e.minutes ?? 0), 0);
  const totalSeconds = totalSavedMin * 60 + (runningHere ? elapsedSec : 0);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["active-timer", brandId] });
    qc.invalidateQueries({ queryKey: ["time-entries", brandId, taskId] });
    qc.invalidateQueries({ queryKey: ["job-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const startMut = useMutation({
    mutationFn: () => startFn({ data: { brandId, taskId } }),
    onSuccess: () => {
      setPaused(false);
      writePaused(taskId, false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pauseMut = useMutation({
    mutationFn: () => stopFn({ data: { entryId: active!.id } }),
    onSuccess: () => {
      setPaused(true);
      writePaused(taskId, true);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const stopMut = useMutation({
    mutationFn: async () => {
      if (runningHere && active) await stopFn({ data: { entryId: active.id } });
      return true;
    },
    onSuccess: () => {
      setPaused(false);
      writePaused(taskId, false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = startMut.isPending || pauseMut.isPending || stopMut.isPending;
  const status: "running" | "paused" | "idle" = runningHere
    ? "running"
    : paused
      ? "paused"
      : "idle";

  return (
    <div
      className={
        compact
          ? "flex items-center gap-2"
          : "flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3"
      }
    >
      <div className="min-w-0">
        <div className="font-mono text-lg tabular-nums leading-none">
          {formatHMS(totalSeconds)}
          {estimatedMinutes ? (
            <span className="ml-1 text-xs text-muted-foreground">
              / {formatMinutes(estimatedMinutes)}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {status === "running"
            ? "Em execução"
            : status === "paused"
              ? "Pausado"
              : "Parado"}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {status === "running" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => pauseMut.mutate()}
            disabled={busy}
            aria-label="Pausar"
          >
            <Pause className="mr-1.5 h-4 w-4" /> Pausar
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => startMut.mutate()}
            disabled={busy}
            aria-label={status === "paused" ? "Retomar" : "Iniciar"}
            title={active && !runningHere ? "Isto vai parar seu timer em outra tarefa" : undefined}
          >
            <Play className="mr-1.5 h-4 w-4" />
            {status === "paused" ? "Retomar" : active ? "Trocar" : "Iniciar"}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => stopMut.mutate()}
          disabled={busy || (status === "idle" && !paused)}
          aria-label="Parar"
        >
          <Square className="mr-1.5 h-4 w-4" /> Parar
        </Button>
      </div>
    </div>
  );
}