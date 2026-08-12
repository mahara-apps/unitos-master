import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Clock, RotateCcw } from "lucide-react";
import { ExpandedModal } from "@/components/ui/expanded-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskTimerWidget } from "@/components/tasks/task-timer-widget";
import {
  listTimeEntriesFn,
  addManualEntryFn,
  deleteEntryFn,
  formatMinutes,
  formatSeconds,
  entryDurationSeconds,
  parseDurationToSeconds,
  type TimeEntry,
} from "@/lib/timesheet.functions";
import { updateJobTaskFn } from "@/lib/project-jobs.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  task: { id: string; title: string; estimated_minutes: number | null; total_minutes: number } | null;
};

export function TaskTimesheetSheet({ open, onOpenChange, brandId, task }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTimeEntriesFn);
  const addFn = useServerFn(addManualEntryFn);
  const delFn = useServerFn(deleteEntryFn);
  const patchTaskFn = useServerFn(updateJobTaskFn);

  const entriesQ = useQuery({
    queryKey: ["time-entries", brandId, task?.id],
    queryFn: () => listFn({ data: { brandId, taskId: task!.id } }),
    enabled: open && !!task,
  });

  const [manualTime, setManualTime] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualRework, setManualRework] = useState(false);
  const addMut = useMutation({
    mutationFn: (seconds: number) =>
      addFn({
        data: {
          brandId,
          taskId: task!.id,
          seconds,
          description: manualDesc || null,
          isRework: manualRework,
        },
      }),
    onSuccess: () => {
      setManualTime("");
      setManualDesc("");
      setManualRework(false);
      qc.invalidateQueries({ queryKey: ["time-entries", brandId, task?.id] });
      qc.invalidateQueries({ queryKey: ["timer-state", brandId] });
      qc.invalidateQueries({ queryKey: ["job-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function submitManual() {
    const s = parseDurationToSeconds(manualTime);
    if (!s) return toast.error("Informe o tempo como HH:MM:SS, HH:MM ou minutos.");
    addMut.mutate(s);
  }

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { entryId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time-entries", brandId, task?.id] });
      qc.invalidateQueries({ queryKey: ["timer-state", brandId] });
      qc.invalidateQueries({ queryKey: ["job-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [estimated, setEstimated] = useState("");
  useEffect(() => {
    setEstimated(task?.estimated_minutes ? formatMinutes(task.estimated_minutes) : "");
  }, [task?.id, task?.estimated_minutes]);
  const estMut = useMutation({
    mutationFn: (mins: number | null) =>
      patchTaskFn({ data: { brandId, taskId: task!.id, patch: { estimated_minutes: mins } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-tasks"] }),
  });

  const entries: TimeEntry[] = entriesQ.data ?? [];
  const reworkSeconds = useMemo(
    () => entries.reduce((sum, e) => sum + (e.is_rework ? entryDurationSeconds(e) : 0), 0),
    [entries],
  );

  return (
    <ExpandedModal open={open} onOpenChange={onOpenChange} size="md" title={task?.title ?? "Tarefa"}>
      {task && (
        <div className="space-y-6">
          {/* Timer (Play · Pause · Stop) */}
          <TaskTimerWidget
            brandId={brandId}
            taskId={task.id}
            estimatedMinutes={task.estimated_minutes}
          />
          {reworkSeconds > 0 && (
            <div className="-mt-4 text-[11px] text-muted-foreground">
              Retrabalho: <span className="font-mono">{formatSeconds(reworkSeconds)}</span>
            </div>
          )}

          {/* Estimativa */}
          <div className="grid gap-1.5">
            <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Estimativa (HH:MM)
            </Label>
            <div className="flex gap-2">
              <Input
                value={estimated}
                onChange={(e) => setEstimated(e.target.value)}
                placeholder="02:00"
                className="h-9"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!estimated.trim()) {
                    estMut.mutate(null);
                    return;
                  }
                  const s = parseDurationToSeconds(estimated);
                  if (s == null) return toast.error("Formato inválido");
                  estMut.mutate(Math.round(s / 60));
                }}
              >
                Salvar
              </Button>
            </div>
          </div>

          {/* Apontamento manual */}
          <div className="rounded-lg border border-border/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <Plus className="h-3 w-3" /> Apontar manualmente
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-[130px_1fr] gap-2">
                <Input
                  placeholder="HH:MM:SS"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="h-9"
                />
                <Textarea
                  placeholder="Descrição (opcional)"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  rows={1}
                  className="min-h-9 resize-none"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={manualRework} onCheckedChange={(v) => setManualRework(!!v)} />
                  <RotateCcw className="h-3 w-3" /> Retrabalho
                </label>
                <Button size="sm" onClick={submitManual} disabled={addMut.isPending}>
                  Adicionar
                </Button>
              </div>
            </div>
          </div>

          {/* Histórico */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <Clock className="h-3 w-3" /> Histórico ({entries.length})
            </div>
            {entries.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                Nenhum apontamento ainda.
              </div>
            ) : (
              <div className="divide-y divide-border/60 rounded-md border border-border/60">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="w-20 font-mono tabular-nums">
                      {e.ended_at ? formatSeconds(entryDurationSeconds(e)) : "em curso"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {e.description || (e.source === "timer" ? "Timer" : "Manual")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {e.user_name ?? "—"} ·{" "}
                        {new Date(e.started_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    {e.is_rework && (
                      <Badge variant="outline" className="text-[10px]">
                        Retrabalho
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => delMut.mutate(e.id)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ExpandedModal>
  );
}
