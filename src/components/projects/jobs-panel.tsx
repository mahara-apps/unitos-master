import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Play,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  RotateCcw,
  Archive,
  Search,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { WorkItemRow, formatRange, formatShortDate, isOverdue } from "./work-item-row";
import { cn } from "@/lib/utils";

/** Job virtual "Pautas": não existe em project_jobs, é a produção de conteúdo. */
const PAUTAS_JOB_ID = "__pautas__";

type Props = {
  brandId: string;
  projectId: string;
  projectName?: string;
  clientName?: string;
  /** Equipe da workspace — origem do responsável único de job/tarefa. */
  team?: TeamOption[];
  currentUserId?: string | null;
  /** Conteúdo do job virtual "Pautas" (renderizado pela tela do projeto). */
  pautasContent?: ReactNode;
  pautasCount?: number;
  /** Rodapé do card (envolvidos no projeto). */
  footer?: ReactNode;
};

export function JobsPanel({
  brandId,
  projectId,
  projectName = "Projeto",
  clientName,
  team = [],
  currentUserId,
  pautasContent,
  pautasCount = 0,
  footer,
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
  const [search, setSearch] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(true);

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
  const effectiveJobId = selectedJobId ?? (hasPautas ? PAUTAS_JOB_ID : (jobs[0]?.id ?? null));
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

  const doneJobs = jobs.filter((j) => !!j.done_at).length;

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

  const currentJob = jobs.find((j) => j.id === effectiveJobId) ?? null;
  const currentTitle = isPautasSelected ? "Pautas" : (currentJob?.name ?? "Tarefas");
  const currentJobTasks = useMemo(() => {
    const list = isPautasSelected ? [] : (tasksByJob.get(effectiveJobId) ?? []);
    const q = search.trim().toLowerCase();
    return q ? list.filter((t) => t.title.toLowerCase().includes(q)) : list;
  }, [isPautasSelected, tasksByJob, effectiveJobId, search]);
  const openTasksCount = currentJobTasks.filter((t) => !t.done && t.status !== "done").length;

  return (
    <DashboardPanelSurface className="overflow-hidden">
      {/* Breadcrumb: Projeto › Job › Tarefas */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-4 py-2">
        <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="truncate">{projectName}</span>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate text-foreground">{currentTitle}</span>
          {!isPautasSelected ? (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" />
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

      <div
        className={cn(
          "grid gap-0",
          commentsOpen
            ? "lg:grid-cols-[220px_minmax(0,1fr)_320px]"
            : "lg:grid-cols-[220px_minmax(0,1fr)_auto]",
          "md:grid-cols-[220px_minmax(0,1fr)]",
        )}
      >
        {/* Coluna 1 — Jobs */}
        <div className="border-b border-border/60 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-foreground">
                Jobs
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {doneJobs} / {jobs.length}
              </span>
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
                className={cn(
                  "flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors",
                  isPautasSelected
                    ? "border-l-primary bg-muted/50"
                    : "border-l-transparent hover:bg-muted/40",
                )}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">Pautas</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {pautasCount} {pautasCount === 1 ? "pauta" : "pautas"}
                  </span>
                </span>
              </button>
            ) : null}

            {jobsQ.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
              </div>
            ) : null}

            {!jobsQ.isLoading && jobs.length === 0 && !addingJob && (
              <div className="p-4 text-xs text-muted-foreground">
                Nenhum job ainda. Crie o primeiro (ex.: “Fazer criativos”).
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
                  className={cn(
                    "flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-l-primary bg-muted/50"
                      : "border-l-transparent hover:bg-muted/40",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: j.color ?? "hsl(var(--primary))" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-medium",
                        done && "text-muted-foreground line-through",
                      )}
                    >
                      {j.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                      <span>
                        {c.done}/{c.total}
                      </span>
                      {c.minutes > 0 ? <span>{formatMinutes(c.minutes)}</span> : null}
                      {formatShortDate(j.due_at) ? (
                        <span className={isOverdue(j.due_at, done) ? "text-destructive" : ""}>
                          {formatShortDate(j.due_at)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <AssigneeAvatar userId={j.assignee_id} options={team} className="h-6 w-6" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Coluna 2 — Tarefas do job selecionado */}
        <div className="min-w-0 border-b border-border/60 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 bg-background/40 px-3 py-2 sm:flex sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Jobs /
              </span>
              <span className="truncate text-sm font-medium">{currentTitle}</span>
              {!isPautasSelected ? (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {openTasksCount} abertas de {currentJobTasks.length}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!isPautasSelected ? (
                <div className="relative hidden sm:block">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Busca"
                    className="h-8 w-[150px] pl-7 text-xs"
                  />
                </div>
              ) : null}
              {currentJob ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Ações do job"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onSelect={() =>
                        jobDoneMut.mutate({ jobId: currentJob.id, done: !currentJob.done_at })
                      }
                    >
                      {currentJob.done_at ? (
                        <>
                          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reabrir job
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Concluir e arquivar
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        const name = window.prompt("Renomear job", currentJob.name);
                        if (name && name.trim())
                          patchJobMut.mutate({
                            jobId: currentJob.id,
                            patch: { name: name.trim() },
                          });
                      }}
                    >
                      Renomear job
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        if (
                          window.confirm(
                            `Excluir job "${currentJob.name}"? As tarefas serão desvinculadas.`,
                          )
                        ) {
                          deleteJobMut.mutate(currentJob.id);
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir job
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          {/* Faixa de atribuições do job */}
          {currentJob ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
              <AssigneePicker
                value={currentJob.assignee_id}
                options={team}
                className="h-8 w-[170px]"
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
                className="h-8 w-[135px] text-xs"
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
                className="h-8 w-[135px] text-xs"
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
                variant={currentJob.done_at ? "secondary" : "default"}
                className="ml-auto h-8 gap-1.5"
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

          {isPautasSelected ? (
            <div className="p-3">{pautasContent}</div>
          ) : (
            <>
              <div className="max-h-[520px] divide-y divide-border/60 overflow-y-auto">
                {tasksQ.isLoading ? (
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : currentJobTasks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    {effectiveJobId
                      ? "Nenhuma tarefa neste job. Adicione a primeira abaixo."
                      : "Selecione ou crie um job para começar."}
                  </div>
                ) : (
                  currentJobTasks.map((t) => {
                    const done = t.done || t.status === "done";
                    return (
                      <WorkItemRow
                        key={t.id}
                        title={t.title}
                        done={done}
                        onToggleDone={() => toggleDoneMut.mutate(t)}
                        onOpen={() => setOpenTask(t)}
                        meta={
                          <>
                            <span className="tabular-nums">
                              {formatMinutes(t.total_minutes)}
                              {t.estimated_minutes
                                ? ` / ${formatMinutes(t.estimated_minutes)}`
                                : ""}
                            </span>
                            {t.archived_at ? <span>· arquivada</span> : null}
                          </>
                        }
                        assignee={
                          <AssigneePicker
                            value={t.assignee_id}
                            options={team}
                            className="h-7 w-[46px] justify-center px-1 [&>svg]:hidden sm:w-[150px] sm:justify-between sm:px-3 sm:[&>svg]:block"
                            placeholder="—"
                            onChange={(userId) =>
                              patchTaskMut.mutate({ taskId: t.id, patch: { assignee_id: userId } })
                            }
                          />
                        }
                        dateLabel={formatRange(t.start_date, t.due_at)}
                        overdue={isOverdue(t.due_at, done)}
                        status={
                          t.priority && t.priority !== "medium" ? (
                            <Badge variant="outline" className="h-5 text-[10px]">
                              {t.priority}
                            </Badge>
                          ) : null
                        }
                        actions={
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="Apontar tempo"
                            onClick={() => setOpenTask(t)}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    );
                  })
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
                <Input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTaskTitle.trim()) createTaskMut.mutate();
                  }}
                  placeholder={effectiveJobId ? "Adicionar uma tarefa…" : "Crie um job primeiro"}
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
            </>
          )}
        </div>

        {/* Coluna 3 — Comentários do nível selecionado */}
        <div className="min-w-0">
          {commentsOpen ? (
            <>
              <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-3 py-2">
                <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Comentários
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Recolher comentários"
                  onClick={() => setCommentsOpen(false)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {currentJob ? (
                <CommentThread
                  brandId={brandId}
                  level="job"
                  projectId={projectId}
                  jobId={currentJob.id}
                  currentUserId={currentUserId}
                  placeholder={`Observação sobre "${currentJob.name}"…`}
                />
              ) : (
                <CommentThread
                  brandId={brandId}
                  level="project"
                  projectId={projectId}
                  currentUserId={currentUserId}
                  placeholder="Observação geral do projeto…"
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center border-b border-border/60 bg-background/40 p-2 lg:h-full lg:border-b-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Abrir comentários"
                onClick={() => setCommentsOpen(true)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {footer ? (
        <div className="border-t border-border/60 bg-background/40 px-4 py-2.5">{footer}</div>
      ) : null}

      <TaskTimesheetSheet
        open={!!openTask}
        onOpenChange={(v) => !v && setOpenTask(null)}
        brandId={brandId}
        breadcrumb={
          clientName ? `${clientName} › ${projectName} › ${currentTitle}` : `${projectName} › ${currentTitle}`
        }
        team={team}
        currentUserId={currentUserId}
        onToggleDone={
          openTask
            ? () => {
                toggleDoneMut.mutate(openTask);
                setOpenTask(null);
              }
            : undefined
        }
        taskDone={!!openTask && (openTask.done || openTask.status === "done")}
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
