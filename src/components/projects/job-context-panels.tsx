import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, History } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { listJobActivityFn, type JobActivity } from "@/lib/project-jobs.functions";
import { entryDurationSeconds, formatMinutes, formatSeconds, listJobTimeEntriesFn } from "@/lib/timesheet.functions";
import { formatDateTimeBr } from "@/lib/timezone";

export function JobTimesheetPanel({ brandId, jobId, estimatedMinutes }: { brandId: string; jobId: string; estimatedMinutes: number | null }) {
  const list = useServerFn(listJobTimeEntriesFn);
  const query = useQuery({ queryKey: ["job-time-entries", brandId, jobId], queryFn: () => list({ data: { brandId, jobId } }) });
  const totalSeconds = (query.data ?? []).reduce((sum, entry) => sum + entryDurationSeconds(entry), 0);
  const estimateSeconds = (estimatedMinutes ?? 0) * 60;
  const percent = estimateSeconds ? Math.min(100, Math.round(totalSeconds / estimateSeconds * 100)) : 0;
  if (query.isPending) return <Skeleton className="h-40" />;
  return <div className="space-y-4"><div className="rounded-md border border-border/60 bg-background p-3"><div className="flex items-end justify-between"><div><p className="text-[10px] uppercase text-muted-foreground">Total do job</p><p className="mt-1 font-mono text-xl tabular-nums">{formatSeconds(totalSeconds)} <span className="text-xs text-muted-foreground">/ {estimatedMinutes ? formatMinutes(estimatedMinutes) : "sem estimativa"}</span></p></div><span className="text-xs text-muted-foreground">{estimateSeconds ? `${percent}%` : "—"}</span></div><Progress value={percent} className="mt-3 h-1.5" /></div><div className="space-y-1">{(query.data ?? []).map((entry) => <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border/50 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-medium">{entry.task_title ?? "Direto no job"}</p><p className="truncate text-[10px] text-muted-foreground">{entry.user_name ?? "Usuário"} · {formatDateTimeBr(entry.started_at)}</p></div><span className="font-mono text-xs tabular-nums">{entry.ended_at ? formatSeconds(entryDurationSeconds(entry)) : "Em andamento"}</span></div>)}{query.data?.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma hora registrada.</p> : null}</div></div>;
}

const VERBS: Record<string, string> = { created: "criou", status_changed: "mudou o status", completed: "concluiu", reopened: "reabriu", timer_started: "iniciou o timer", timer_paused: "pausou o timer", timer_stopped: "encerrou o timer" };

export function JobHistoryPanel({ brandId, jobId }: { brandId: string; jobId: string }) {
  const list = useServerFn(listJobActivityFn);
  const query = useQuery({ queryKey: ["job-activity", brandId, jobId], queryFn: () => list({ data: { brandId, jobId } }) });
  const events = (query.data ?? []) as JobActivity[];
  if (query.isPending) return <Skeleton className="h-40" />;
  return <div className="relative space-y-0 pl-4 before:absolute before:bottom-3 before:left-[6px] before:top-3 before:w-px before:bg-border">{events.map((event) => <div key={event.id} className="relative pb-5 pl-4"><span className="absolute left-[-14px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" /><p className="text-xs"><strong>{event.actor_name ?? "Sistema"}</strong> {VERBS[event.verb] ?? event.verb}{event.payload && !Array.isArray(event.payload) && typeof event.payload === "object" && typeof event.payload.title === "string" ? ` “${event.payload.title}”` : ""}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDateTimeBr(event.created_at)}</p></div>)}{events.length === 0 ? <div className="flex flex-col items-center gap-2 py-10 text-xs text-muted-foreground"><History className="h-5 w-5" />Nenhuma atividade registrada.</div> : null}</div>;
}