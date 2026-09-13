import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMinutes, formatSeconds, getJobTimerStateFn, startJobTimerFn, stopTimerFn, type JobTimerState } from "@/lib/timesheet.functions";

export function JobTimerWidget({ brandId, jobId, estimatedMinutes }: { brandId: string; jobId: string; estimatedMinutes: number | null }) {
  const qc = useQueryClient();
  const getState = useServerFn(getJobTimerStateFn);
  const start = useServerFn(startJobTimerFn);
  const stop = useServerFn(stopTimerFn);
  const stateQ = useQuery({ queryKey: ["job-timer-state", brandId, jobId], queryFn: () => getState({ data: { brandId, jobId } }), refetchInterval: 60_000 });
  const state = stateQ.data as JobTimerState | undefined;
  const active = state?.active ?? null;
  const running = active?.job_id === jobId;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!running) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [running]);
  const live = useMemo(() => running && active ? Math.max(0, (active.elapsed_seconds ?? 0) + Math.floor((now - (stateQ.dataUpdatedAt || now)) / 1000)) : 0, [active, now, running, stateQ.dataUpdatedAt]);
  const total = (state?.totalSeconds ?? 0) + live;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["job-timer-state", brandId, jobId] }); qc.invalidateQueries({ queryKey: ["job-time-entries", brandId, jobId] }); qc.invalidateQueries({ queryKey: ["job-activity", brandId, jobId] }); };
  const startMut = useMutation({ mutationFn: () => start({ data: { brandId, jobId } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const stopMut = useMutation({ mutationFn: (reason: "pause" | "stop") => active ? stop({ data: { entryId: active.id, reason } }) : Promise.resolve({ seconds: 0 }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const busy = startMut.isPending || stopMut.isPending;
  return <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background px-2 py-1"><span className="min-w-24 font-mono text-xs tabular-nums">{formatSeconds(total)} <span className="text-muted-foreground">/ {estimatedMinutes ? formatMinutes(estimatedMinutes) : "--:--"}</span></span>{running ? <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" aria-label="Pausar timer do job" onClick={() => stopMut.mutate("pause")} disabled={busy}><Pause className="h-3.5 w-3.5" /></Button> : <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" aria-label="Iniciar timer do job" onClick={() => startMut.mutate()} disabled={busy}><Play className="h-3.5 w-3.5" /></Button>}<Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" aria-label="Parar timer do job" onClick={() => stopMut.mutate("stop")} disabled={busy || !running}><Square className="h-3 w-3" /></Button></div>;
}