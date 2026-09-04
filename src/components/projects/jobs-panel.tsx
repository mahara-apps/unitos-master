import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Clock,
  Trash2,
  Play,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
  Archive,
  CalendarDays,
  Sparkles,
} from "lucide-react";
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
  setJobDoneFn,
  updateJobFn,
  updateJobTaskFn,
  type JobTask,
  type ProjectJob,
} from "@/lib/project-jobs.functions";
import { formatMinutes } from "@/lib/timesheet.functions";
import { TaskTimesheetSheet } from "./task-timesheet-sheet";
import { CommentThread } from "./comment-thread";
import { AssigneeAvatar, AssigneePicker, type TeamOption } from "./assignee-picker";
import { StatusPicker } from "./status-picker";

/** Job virtual "Pautas": não existe em project_jobs, é a produção de conteúdo. */
const PAUTAS_JOB_ID = "__pautas__";

type Props = {
  brandId: string;
  projectId: string;
  projectName?: string;
  /** Equipe da workspace — origem do responsável único de job/tarefa. */
  team?: TeamOption[];
  currentUserId?: string | null;
  /** Conteúdo do job virtual "Pautas" (renderizado pela tela do projeto). */
  pautasContent?: ReactNode;
  pautasCount?: number;
};

export function JobsPanel({
  brandId,
  projectId,
  projectName = "Projeto",
  team = [],
  currentUserId,
  pautasContent,
  pautasCount = 0,
}: Props) {
  const qc = useQueryClient();
  const listJobs = useServerFn(listJobsFn);
  const listTasks = useServerFn(listProjectTasksFn);
  const createJob = useServerFn(createJobFn);
  const updateJob = useServerFn(updateJobFn);
  const deleteJob = useServerFn(deleteJobFn);
  const setJobDone = useServerFn(setJobDoneFn);
  const createTask = useServerFn(createJobTaskFn);
  const updateTask = useServerFn(updateJobTaskFn);

  /** Concluídos ficam arquivados; este filtro permite revê-los. */
  const [showDone, setShowDone] = useState(false);

  const jobsQ = useQuery({
    queryKey: ["project-jobs", brandId, projectId, showDone ? "all" : "active"],
    queryFn: () => listJobs({ data: { brandId, projectId, archive: showDone ? "all" : "active" } }),
  });
  const tasksQ = useQuery({
    queryKey: ["job-tasks", brandId, projectId],
    queryFn: () => listTasks({ data: { brandId, projectId, archive: "all" } }),
  });

  const jobs: ProjectJob[] = jobsQ.data ?? [];
  const allTasks: JobTask[] = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const tasks = useMemo(
    () => (showDone ? allTasks : allTasks.filter((t) => !t.archived_at)),
    [allTasks, showDone],
  );

  const hasPautas = !!pautasContent;
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const effectiveJobId =
    selectedJobId ?? (hasPautas ? PAUTAS_JOB_ID : (jobs[0]?.id ?? null));
  const isPautasSelected = effectiveJobId === PAUTAS_JOB_ID;

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

  const invalidateJobs = () =>
    qc.invalidateQueries({ queryKey: ["project-jobs", brandId, projectId] });

  const [newJobName, setNewJobName] = useState("");
  const [addingJob, setAddingJob] = useState(false);
  const createJobMut = useMutation({
    mutationFn: () => createJob({ data: { brandId, projectId, name: newJobName.trim() } }),
    onSuccess: () => {
      setNewJobName("");
      setAddingJob(false);
      invalidateJobs();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteJobMut = useMutation({
    mutationFn: (jobId: string) => deleteJob({ data: { brandId, jobId } }),
    onSuccess: invalidateJobs,
    onError: (e: Error) => toast.error(e.message),
  });
  const patchJobMut = useMutation({
    mutationFn: (v: { jobId: string; patch: Record<string, unknown> }) =>
      updateJob({ data: { brandId, jobId: v.jobId, patch: v.patch as never } }),
    onSuccess: invalidateJobs,
    onError: (e: Error) => toast.error(e.message),
  });
  const jobDoneMut = useMutation({
    mutationFn: (v: { jobId: string; done: boolean }) =>
      setJobDone({ data: { brandId, jobId: v.jobId, done: v.done } }),
    onSuccess: (_r, v) => {
      if (v.done) setSelectedJobId(null);
      invalidateJobs();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const createTaskMut = useMutation({
    mutationFn: () =>
      createTask({
        data: {
          brandId,
          projectId,
          jobId: isPautasSelected ? null : effectiveJobId,
          title: newTaskTitle.trim(),
        },
      }),
    onSuccess: () => {
      setNewTaskTitle("");
      qc.invalidateQueries({ queryKey: ["job-tasks", brandId, projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchTaskMut = useMutation({
    mutationFn: (v: { taskId: string; patch: Record<string, unknown> }) =>
      updateTask({ data: { brandId, taskId: v.taskId, patch: v.patch as never } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-tasks", brandId, projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDoneMut = useMutation({
    mutationFn: (t: JobTask) =>
      updateTask({
        data: {
          brandId,
          taskId: t.id,
          // done = true conclui e arquiva; false reabre.
          patch: { done: !t.done },
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-tasks", brandId, projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [openTask, setOpenTask] = useState<JobTask | null>(null);

  const currentJobTasks = isPautasSelected ? [] : (tasksByJob.get(effectiveJobId) ?? []);
  const currentJob = jobs.find((j) => j.id === effectiveJobId) ?? null;
  const currentTitle = isPautasSelected ? "Pautas" : (currentJob?.name ?? "Tarefas");

  return (
    <DashboardPanelSurface className="overflow-hidden">
      {/* Hierarquia: Projeto › Job › Tarefas */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-4 py-2">
        <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="truncate">{projectName}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-foreground">{currentTitle}</span>
          {!isPautasSelected ? (
            <>
              <ChevronRight className="h-3 w-3" />
              <span>Tarefas</span>
            </>
          ) : null}
        </div>
        <Button
          size="sm"
          variant={showDone ? "secondary" : "ghost"}
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setShowDone((v) => !v)}
        >
          <Archive className="h-3 w-3" />
          {showDone ? "Ocultar concluídos" : "Ver concluídos"}
        </Button>
      </div>

      <div className="grid gap-0 md:grid-cols-[260px_1fr]">
        {/* Coluna Jobs */}
        <div className="border-b border-border/60 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-foreground">
              Jobs
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Novo job"
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
                placeholder="Ex.: Fazer criativos"
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
          <div className="max-h-[620px] overflow-y-auto">
            {hasPautas ? (
              <button
                onClick={() => setSelectedJobId(PAUTAS_JOB_ID)}
                className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left transition ${
                  isPautasSelected
                    ? "border-l-primary bg-muted/60"
                    : "border-l-transparent hover:bg-muted/30"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">Pautas</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {pautasCount} {pautasCount === 1 ? "pauta" : "pautas"} do projeto
                  </div>
                </div>
              </button>
            ) : null}
            {jobs.length === 0 && !addingJob && (
              <div className="p-4 text-xs text-muted-foreground">
                Nenhum job. Clique em + para criar um (ex.: “Fazer criativos”).
              </div>
            )}
            {jobs.map((j) => {
              const c = jobCounts.get(j.id) ?? { total: 0, done: 0, minutes: 0 };
              const active = j.id === effectiveJobId;
              const done = !!j.done_at;
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
                    <div
                      className={`truncate text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
                    >
                      {j.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {c.done}/{c.total}
                      </span>
                      {c.minutes > 0 && (
                        <span className="font-mono tabular-nums">{formatMinutes(c.minutes)}</span>
                      )}
                      {j.due_at ? (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-2.5 w-2.5" />
                          {new Date(j.due_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <AssigneeAvatar userId={j.assignee_id} options={team} className="h-6 w-6" />
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
                            patchJobMut.mutate({ jobId: j.id, patch: { name: name.trim() } });
                        }}
                      >
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => jobDoneMut.mutate({ jobId: j.id, done: !done })}
                      >
                        {done ? (
                          <>
                            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reabrir
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Concluir e arquivar
                          </>
                        )}
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

        {/* Coluna do job selecionado */}
        <div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/40 px-4 py-2.5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-foreground">
              {currentTitle}
            </div>
            {!isPautasSelected ? (
              <span className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-xs tabular-nums">
                {currentJobTasks.length}
              </span>
            ) : null}
            {currentJob ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <AssigneePicker
                  value={currentJob.assignee_id}
                  options={team}
                  className="h-8 w-[180px]"
                  onChange={(userId) =>
                    patchJobMut.mutate({ jobId: currentJob.id, patch: { assignee_id: userId } })
                  }
                />
                <StatusPicker
                  brandId={brandId}
                  scope="job"
                  value={currentJob.status_id}
                  onChange={(statusId) =>
                    patchJobMut.mutate({ jobId: currentJob.id, patch: { status_id: statusId } })
                  }
                />
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  aria-label="Início do job"
                  defaultValue={currentJob.start_date ? currentJob.start_date.slice(0, 10) : ""}
                  onBlur={(e) =>
                    patchJobMut.mutate({
                      jobId: currentJob.id,
                      patch: { start_date: e.target.value || null },
                    })
                  }
                />
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  aria-label="Prazo do job"
                  defaultValue={currentJob.due_at ? currentJob.due_at.slice(0, 10) : ""}
                  onBlur={(e) =>
                    patchJobMut.mutate({
                      jobId: currentJob.id,
                      patch: { due_at: e.target.value || null },
                    })
                  }
                />
                <Button
                  size="sm"
                  variant={currentJob.done_at ? "secondary" : "outline"}
                  className="h-8 gap-1.5"
                  onClick={() =>
                    jobDoneMut.mutate({ jobId: currentJob.id, done: !currentJob.done_at })
                  }
                >
                  {currentJob.done_at ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </div>

          {isPautasSelected ? (
            <div className="p-3">{pautasContent}</div>
          ) : (
            <>
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
              <div className="max-h-[460px] divide-y divide-border/60 overflow-y-auto">
                {currentJobTasks.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    {effectiveJobId ? "Nenhuma tarefa neste job." : "Selecione ou crie um job."}
                  </div>
                ) : (
                  currentJobTasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={t.done || t.status === "done"}
                        onChange={() => toggleDoneMut.mutate(t)}
                        className="h-4 w-4 shrink-0 rounded border-border"
                        aria-label="Concluir tarefa"
                      />
                      <button onClick={() => setOpenTask(t)} className="min-w-0 flex-1 text-left">
                        <div
                          className={`truncate text-sm ${t.done || t.status === "done" ? "text-muted-foreground line-through" : ""}`}
                        >
                          {t.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span className="font-mono tabular-nums">
                            {formatMinutes(t.total_minutes)}
                            {t.estimated_minutes ? ` / ${formatMinutes(t.estimated_minutes)}` : ""}
                          </span>
                          {t.due_at ? (
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-2.5 w-2.5" />
                              {new Date(t.due_at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          ) : null}
                          {t.archived_at ? <span>arquivada</span> : null}
                        </div>
                      </button>
                      <AssigneePicker
                        value={t.assignee_id}
                        options={team}
                        className="h-7 w-[150px]"
                        placeholder="Responsável"
                        onChange={(userId) =>
                          patchTaskMut.mutate({ taskId: t.id, patch: { assignee_id: userId } })
                        }
                      />
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

              {/* Comentários do JOB */}
              {currentJob ? (
                <div className="border-t border-border/60">
                  <CommentThread
                    brandId={brandId}
                    level="job"
                    projectId={projectId}
                    jobId={currentJob.id}
                    currentUserId={currentUserId}
                    placeholder={`Observação sobre "${currentJob.name}"…`}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <TaskTimesheetSheet
        open={!!openTask}
        onOpenChange={(v) => !v && setOpenTask(null)}
        brandId={brandId}
        breadcrumb={`${projectName} › ${currentTitle} › ${openTask?.title ?? ""}`}
        team={team}
        currentUserId={currentUserId}
        task={
          openTask
            ? {
                id: openTask.id,
                title: openTask.title,
                estimated_minutes: openTask.estimated_minutes,
                total_minutes: openTask.total_minutes,
                assignee_id: openTask.assignee_id,
                status_id: openTask.status_id,
                start_date: openTask.start_date,
                due_at: openTask.due_at,
              }
            : null
        }
      />
    </DashboardPanelSurface>
  );
}
