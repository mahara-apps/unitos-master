import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Clock, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import {
  createJobFn,
  createJobTaskFn,
  deleteJobFn,
  listJobsFn,
  listProjectTasksFn,
  updateJobFn,
  updateJobTaskFn,
  type JobTask,
  type ProjectJob,
} from "@/lib/project-jobs.functions";
import { formatMinutes } from "@/lib/timesheet.functions";
import { TaskTimesheetSheet } from "./task-timesheet-sheet";

type Props = { brandId: string; projectId: string };

export function JobsPanel({ brandId, projectId }: Props) {
  const qc = useQueryClient();
  const listJobs = useServerFn(listJobsFn);
  const listTasks = useServerFn(listProjectTasksFn);
  const createJob = useServerFn(createJobFn);
  const updateJob = useServerFn(updateJobFn);
  const deleteJob = useServerFn(deleteJobFn);
  const createTask = useServerFn(createJobTaskFn);
  const updateTask = useServerFn(updateJobTaskFn);

  const jobsQ = useQuery({
    queryKey: ["project-jobs", brandId, projectId],
    queryFn: () => listJobs({ data: { brandId, projectId } }),
  });
  const tasksQ = useQuery({
    queryKey: ["job-tasks", brandId, projectId],
    queryFn: () => listTasks({ data: { brandId, projectId } }),
  });

  const jobs: ProjectJob[] = jobsQ.data ?? [];
  const tasks: JobTask[] = tasksQ.data ?? [];
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const effectiveJobId = selectedJobId ?? jobs[0]?.id ?? null;

  const tasksByJob = useMemo(() => {
    const map = new Map<string | null, JobTask[]>();
    for (const t of tasks) {
      const key = t.job_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const jobCounts = useMemo(() => {
    const map = new Map<string | null, { total: number; done: number; minutes: number }>();
    for (const t of tasks) {
      const key = t.job_id ?? null;
      const cur = map.get(key) ?? { total: 0, done: 0, minutes: 0 };
      cur.total += 1;
      if (t.status === "done") cur.done += 1;
      cur.minutes += t.total_minutes ?? 0;
      map.set(key, cur);
    }
    return map;
  }, [tasks]);

  const [newJobName, setNewJobName] = useState("");
  const [addingJob, setAddingJob] = useState(false);
  const createJobMut = useMutation({
    mutationFn: () => createJob({ data: { brandId, projectId, name: newJobName.trim() } }),
    onSuccess: () => {
      setNewJobName("");
      setAddingJob(false);
      qc.invalidateQueries({ queryKey: ["project-jobs", brandId, projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteJobMut = useMutation({
    mutationFn: (jobId: string) => deleteJob({ data: { brandId, jobId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-jobs", brandId, projectId] }),
  });
  const renameJobMut = useMutation({
    mutationFn: (v: { jobId: string; name: string }) =>
      updateJob({ data: { brandId, jobId: v.jobId, patch: { name: v.name } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-jobs", brandId, projectId] }),
  });

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const createTaskMut = useMutation({
    mutationFn: () =>
      createTask({
        data: {
          brandId,
          projectId,
          jobId: effectiveJobId,
          title: newTaskTitle.trim(),
        },
      }),
    onSuccess: () => {
      setNewTaskTitle("");
      qc.invalidateQueries({ queryKey: ["job-tasks", brandId, projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDoneMut = useMutation({
    mutationFn: (t: JobTask) =>
      updateTask({
        data: {
          brandId,
          taskId: t.id,
          patch: {
            status: t.status === "done" ? "todo" : "done",
            done: t.status !== "done",
          },
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-tasks", brandId, projectId] }),
  });

  const [openTask, setOpenTask] = useState<JobTask | null>(null);

  const currentJobTasks = tasksByJob.get(effectiveJobId) ?? [];
  const currentJob = jobs.find((j) => j.id === effectiveJobId) ?? null;

  return (
    <DashboardPanelSurface className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[260px_1fr]">
        {/* Coluna Jobs */}
        <div className="border-b border-border/60 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
            <div className="text-[11px] font-mono uppercase tracking-widest text-foreground">
              Jobs
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setAddingJob((v) => !v)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {addingJob && (
            <div className="flex gap-2 border-b border-border/60 p-2">
              <Input
                autoFocus
                value={newJobName}
                onChange={(e) => setNewJobName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newJobName.trim()) createJobMut.mutate();
                  if (e.key === "Escape") setAddingJob(false);
                }}
                placeholder="Nome do job"
                className="h-8"
              />
              <Button
                size="sm"
                className="h-8"
                onClick={() => createJobMut.mutate()}
                disabled={!newJobName.trim()}
              >
                Ok
              </Button>
            </div>
          )}
          <div className="max-h-[520px] overflow-y-auto">
            {jobs.length === 0 && !addingJob && (
              <div className="p-4 text-xs text-muted-foreground">
                Nenhum job. Clique em + para criar um agrupador.
              </div>
            )}
            {jobs.map((j) => {
              const c = jobCounts.get(j.id) ?? { total: 0, done: 0, minutes: 0 };
              const active = j.id === effectiveJobId;
              return (
                <button
                  key={j.id}
                  onClick={() => setSelectedJobId(j.id)}
                  className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left transition ${
                    active
                      ? "border-l-primary bg-muted/60"
                      : "border-l-transparent hover:bg-muted/30"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: j.color ?? "#8b5cf6" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{j.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {c.done}/{c.total}
                      </span>
                      {c.minutes > 0 && (
                        <span className="font-mono tabular-nums">{formatMinutes(c.minutes)}</span>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onSelect={() => {
                          const name = window.prompt("Renomear job", j.name);
                          if (name && name.trim())
                            renameJobMut.mutate({ jobId: j.id, name: name.trim() });
                        }}
                      >
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => {
                          if (
                            window.confirm(
                              `Excluir job "${j.name}"? As tarefas serão desvinculadas.`,
                            )
                          ) {
                            deleteJobMut.mutate(j.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coluna Tasks */}
        <div>
          <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-foreground">
                {currentJob ? currentJob.name : "Tarefas"}
              </div>
              <span className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-xs tabular-nums">
                {currentJobTasks.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTaskTitle.trim()) createTaskMut.mutate();
              }}
              placeholder={effectiveJobId ? "Adicionar tarefa..." : "Crie um job primeiro"}
              disabled={!effectiveJobId}
              className="h-8"
            />
            <Button
              size="sm"
              className="h-8"
              onClick={() => createTaskMut.mutate()}
              disabled={!newTaskTitle.trim() || !effectiveJobId}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <div className="max-h-[520px] divide-y divide-border/60 overflow-y-auto">
            {currentJobTasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {effectiveJobId ? "Nenhuma tarefa neste job." : "Selecione ou crie um job."}
              </div>
            ) : (
              currentJobTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => toggleDoneMut.mutate(t)}
                    className="h-4 w-4 shrink-0 rounded border-border"
                  />
                  <button onClick={() => setOpenTask(t)} className="min-w-0 flex-1 text-left">
                    <div
                      className={`truncate text-sm ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}
                    >
                      {t.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="font-mono tabular-nums">
                        {formatMinutes(t.total_minutes)}
                        {t.estimated_minutes ? ` / ${formatMinutes(t.estimated_minutes)}` : ""}
                      </span>
                    </div>
                  </button>
                  {t.priority && t.priority !== "medium" && (
                    <Badge variant="outline" className="text-[10px]">
                      {t.priority}
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Apontar"
                    onClick={() => setOpenTask(t)}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <TaskTimesheetSheet
        open={!!openTask}
        onOpenChange={(v) => !v && setOpenTask(null)}
        brandId={brandId}
        task={
          openTask
            ? {
                id: openTask.id,
                title: openTask.title,
                estimated_minutes: openTask.estimated_minutes,
                total_minutes: openTask.total_minutes,
              }
            : null
        }
      />
    </DashboardPanelSurface>
  );
}
