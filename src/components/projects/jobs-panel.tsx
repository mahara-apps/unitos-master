import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Kanban,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Copy,
  Share2,
  ArrowUpDown,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkLinks } from "@/components/ui/work-links";
import { cn } from "@/lib/utils";
import {
  createJobFn,
  createJobTaskFn,
  deleteJobFn,
  duplicateJobFn,
  listJobsFn,
  listJobTimeRollupsFn,
  listProjectTasksFn,
  setJobArchivedFn,
  setJobDoneFn,
  updateJobFn,
  updateJobTaskFn,
  type JobTask,
  type ProjectJob,
} from "@/lib/project-jobs.functions";
import { deleteTaskFn, setTaskArchivedFn, TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/tasks.functions";
import { formatMinutes } from "@/lib/timesheet.functions";
import {
  isItemDone,
  matchesDue,
  matchesVisibility,
  needsArchived,
  VISIBILITY_LABELS,
  type DueFilter,
  type VisibilityFilter,
} from "@/lib/work-visibility";
import { PRIORITY_META, STATUS_META } from "@/components/tasks/shared";
import { TaskTimerWidget } from "@/components/tasks/task-timer-widget";
import { AssigneeAvatar, AssigneePicker, type TeamOption } from "./assignee-picker";
import { CommentThread } from "./comment-thread";
import { ContextTabs } from "./context-tabs";
import { DueDateChip } from "./due-date-chip";
import { JobDetailModal } from "./job-detail-modal";
import { JobBriefingEditor } from "./job-briefing-editor";
import { JobHistoryPanel, JobTimesheetPanel } from "./job-context-panels";
import { JobTimerWidget } from "./job-timer-widget";
import { StatusPicker, useWorkStatuses } from "./status-picker";
import { TaskSubtasksPopover } from "./task-subtasks-popover";
import { TaskTimesheetSheet } from "./task-timesheet-sheet";
import { DueMenuBlock, VisibilityMenuBlock } from "./work-filter-menu";
import { isOverdue } from "./work-item-row";
import { ensureWorkStatusDefaultsFn } from "@/lib/work-statuses.functions";
import { JobListView, type JobListStats } from "./job-list-view";

type Props = {
  brandId: string;
  projectId: string;
  projectName?: string;
  clientName?: string;
  team?: TeamOption[];
  currentUserId?: string | null;
  pautasContent?: ReactNode;
  pautasCount?: number;
  footer?: ReactNode;
  onOpenPautas?: () => void;
  onCreatePauta?: () => void;
  initialMode?: "overview" | "jobs";
  initialJobId?: string | null;
  onOpenJobChange?: (jobId: string | null) => void;
};

type JobStats = JobListStats;

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

function shortDate(value: string | null) {
  if (!value) return "Sem data";
  return new Date(`${dateOnly(value)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function timelineState(start: string | null, due: string | null) {
  if (!start || !due) return { percent: 0, label: "Defina início e entrega" };
  const startMs = new Date(`${dateOnly(start)}T00:00:00`).getTime();
  const dueMs = new Date(`${dateOnly(due)}T23:59:59`).getTime();
  const now = Date.now();
  const span = Math.max(1, dueMs - startMs);
  const percent = Math.max(0, Math.min(100, Math.round(((now - startMs) / span) * 100)));
  const days = Math.ceil((dueMs - now) / 86_400_000);
  return {
    percent,
    label: days < 0 ? `${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"} em atraso` : days === 0 ? "Entrega hoje" : `${days} dia${days === 1 ? "" : "s"} restante${days === 1 ? "" : "s"}`,
  };
}

function TaskBoardCard({ task, team, onOpen }: { task: JobTask; team: TeamOption[]; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article ref={setNodeRef} style={style} {...attributes} {...listeners} className={cn("cursor-grab rounded-lg border border-border/60 bg-background p-3 shadow-sm", isDragging && "opacity-40")}>
      <Button variant="ghost" className="h-auto w-full justify-start p-0 text-left" onClick={onOpen}>{task.title}</Button>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn("text-[9px]", PRIORITY_META[task.priority].badge)}>{PRIORITY_META[task.priority].label}</Badge>
        <AssigneeAvatar userId={task.assignee_id} options={team} className="h-6 w-6" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{shortDate(task.due_at)}</span><span>{formatMinutes(task.total_minutes)}</span></div>
    </article>
  );
}

function TaskBoardColumn({ status, tasks, team, onOpen }: { status: TaskStatus; tasks: JobTask[]; team: TeamOption[]; onOpen: (task: JobTask) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `task-status:${status}` });
  return (
    <section className="flex w-[230px] shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/25">
      <div className={cn("h-1", STATUS_META[status].dot)} />
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5"><span className={cn("h-2 w-2 rounded-full", STATUS_META[status].dot)} /><h3 className="text-xs font-semibold">{STATUS_META[status].label}</h3><Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px]">{tasks.length}</Badge></header>
      <div ref={setNodeRef} className={cn("flex min-h-[190px] flex-1 flex-col gap-2 p-2", isOver && "bg-primary/5")}>
        {tasks.map((task) => <TaskBoardCard key={task.id} task={task} team={team} onOpen={() => onOpen(task)} />)}
        {tasks.length === 0 ? <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border/60 p-4 text-center text-[10px] text-muted-foreground">Sem tarefas</div> : null}
      </div>
    </section>
  );
}

export function JobsPanel({ brandId, projectId, projectName = "Projeto", clientName, team = [], currentUserId, pautasContent, pautasCount = 0, footer, onOpenPautas, onCreatePauta, initialMode = "overview", initialJobId = null, onOpenJobChange }: Props) {
  const qc = useQueryClient();
  const listJobs = useServerFn(listJobsFn);
  const listTasks = useServerFn(listProjectTasksFn);
  const createJob = useServerFn(createJobFn);
  const duplicateJob = useServerFn(duplicateJobFn);
  const listJobTimeRollups = useServerFn(listJobTimeRollupsFn);
  const updateJob = useServerFn(updateJobFn);
  const deleteJob = useServerFn(deleteJobFn);
  const setJobDone = useServerFn(setJobDoneFn);
  const setJobArchived = useServerFn(setJobArchivedFn);
  const setTaskArchived = useServerFn(setTaskArchivedFn);
  const deleteTask = useServerFn(deleteTaskFn);
  const createTask = useServerFn(createJobTaskFn);
  const updateTask = useServerFn(updateJobTaskFn);
  const ensureStatuses = useServerFn(ensureWorkStatusDefaultsFn);
  const [visibility, setVisibility] = useState<VisibilityFilter>("active");
  const [taskVisibility, setTaskVisibility] = useState<VisibilityFilter>("active");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"overview" | "jobs">(initialMode);
  const [openJobId, setOpenJobIdState] = useState<string | null>(initialJobId);
  const [pautasOpen, setPautasOpen] = useState(false);
  const [taskView, setTaskView] = useState<"list" | "board">("list");
  const [openTask, setOpenTask] = useState<JobTask | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskSort, setTaskSort] = useState<"position" | "due" | "name">("position");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const workStatusesQ = useWorkStatuses(brandId, "job");
  const taskStatusesQ = useWorkStatuses(brandId, "task");

  const setOpenJobId = (jobId: string | null) => { setOpenJobIdState(jobId); onOpenJobChange?.(jobId); };
  useEffect(() => setMode(initialMode), [initialMode]);
  useEffect(() => setOpenJobIdState(initialJobId), [initialJobId]);
  useEffect(() => {
    if (!brandId || (workStatusesQ.data?.length && taskStatusesQ.data?.length)) return;
    ensureStatuses({ data: { brandId } }).then(() => {
      qc.invalidateQueries({ queryKey: ["work-statuses", brandId] });
    }).catch(() => undefined);
  }, [brandId, ensureStatuses, qc, taskStatusesQ.data?.length, workStatusesQ.data?.length]);

  const jobsArchive = needsArchived(visibility) ? "all" : "active";
  const jobsQ = useQuery({ queryKey: ["project-jobs", brandId, projectId, jobsArchive], queryFn: () => listJobs({ data: { brandId, projectId, archive: jobsArchive } }) });
  const tasksQ = useQuery({ queryKey: ["job-tasks", brandId, projectId], queryFn: () => listTasks({ data: { brandId, projectId, archive: "all" } }) });
  const timeRollupsQ = useQuery({ queryKey: ["job-time-rollups", brandId, projectId], queryFn: () => listJobTimeRollups({ data: { brandId, projectId } }), refetchInterval: 60_000 });
  const allJobs = useMemo<ProjectJob[]>(() => jobsQ.data ?? [], [jobsQ.data]);
  const jobs = useMemo(() => allJobs.filter((job) => matchesVisibility({ done: !!job.done_at, archived_at: job.archived_at }, visibility)), [allJobs, visibility]);
  const allTasks = useMemo<JobTask[]>(() => tasksQ.data ?? [], [tasksQ.data]);
  const tasks = useMemo(() => visibility === "active" ? allTasks.filter((task) => !task.archived_at && !isItemDone(task)) : allTasks, [allTasks, visibility]);
  const statuses = workStatusesQ.data ?? [];
  const statusMap = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses]);

  const jobStats = useMemo(() => {
    const map = new Map<string, JobStats>();
    for (const task of tasks) {
      if (!task.job_id) continue;
      const current = map.get(task.job_id) ?? { total: 0, done: 0, minutes: 0, assignees: [] };
      current.total += 1;
      if (task.done || task.status === "done") current.done += 1;
      current.minutes += task.total_minutes ?? 0;
      if (task.assignee_id) current.assignees.push(task.assignee_id);
      map.set(task.job_id, current);
    }
    return map;
  }, [tasks]);

  const taskTotals = useMemo(() => ({ total: tasks.length, done: tasks.filter(isItemDone).length }), [tasks]);
  const visibleJobs = useMemo(() => { const q = search.trim().toLowerCase(); return q ? jobs.filter((job) => job.name.toLowerCase().includes(q) || `${job.job_number}.1`.includes(q.replace(/^#/, ""))) : jobs; }, [jobs, search]);
  const timeRollups = useMemo(() => new Map((timeRollupsQ.data ?? []).map((row) => [row.jobId, row])), [timeRollupsQ.data]);
  const currentJob = allJobs.find((job) => job.id === openJobId) ?? null;
  const currentJobTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    return allTasks.filter((task) => task.job_id === openJobId && matchesVisibility(task, taskVisibility) && matchesDue(task.due_at, isItemDone(task), dueFilter) && (!query || task.title.toLowerCase().includes(query))).sort((a, b) => taskSort === "name" ? a.title.localeCompare(b.title, "pt-BR") : taskSort === "due" ? (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") : a.position - b.position);
  }, [allTasks, openJobId, taskVisibility, dueFilter, taskSearch, taskSort]);
  const openTasksCount = currentJobTasks.filter((task) => !isItemDone(task)).length;
  const currentStats = currentJob ? (jobStats.get(currentJob.id) ?? { total: 0, done: 0, minutes: 0, assignees: [] }) : { total: 0, done: 0, minutes: 0, assignees: [] };
  const timeline = currentJob ? timelineState(currentJob.start_date, currentJob.due_at) : { percent: 0, label: "" };
  const hasPautas = !!pautasContent || !!onOpenPautas;
  const openPautas = onOpenPautas ?? (() => setPautasOpen(true));

  const invalidateJobs = () => qc.invalidateQueries({ queryKey: ["project-jobs", brandId, projectId] });
  const invalidateTasks = () => qc.invalidateQueries({ queryKey: ["job-tasks", brandId, projectId] });
  const createJobMut = useMutation({ mutationFn: (value: { name: string; statusId?: string | null }) => createJob({ data: { brandId, projectId, name: value.name, statusId: value.statusId } }), onSuccess: invalidateJobs, onError: (error: Error) => toast.error(error.message) });
  const duplicateJobMut = useMutation({ mutationFn: (jobId: string) => duplicateJob({ data: { brandId, jobId } }), onSuccess: (row) => { invalidateJobs(); invalidateTasks(); toast.success("Job duplicado"); setOpenJobId(row.id); }, onError: (error: Error) => toast.error(error.message) });
  const deleteJobMut = useMutation({ mutationFn: (jobId: string) => deleteJob({ data: { brandId, jobId } }), onSuccess: () => { setOpenJobId(null); invalidateJobs(); }, onError: (error: Error) => toast.error(error.message) });
  const patchJobMut = useMutation({ mutationFn: (value: { jobId: string; patch: Record<string, unknown> }) => updateJob({ data: { brandId, jobId: value.jobId, patch: value.patch as never } }), onSuccess: invalidateJobs, onError: (error: Error) => toast.error(error.message) });
  const jobDoneMut = useMutation({ mutationFn: (value: { jobId: string; done: boolean }) => setJobDone({ data: { brandId, jobId: value.jobId, done: value.done } }), onSuccess: invalidateJobs, onError: (error: Error) => toast.error(error.message) });
  const jobArchiveMut = useMutation({ mutationFn: (value: { jobId: string; archived: boolean }) => setJobArchived({ data: { brandId, jobId: value.jobId, archived: value.archived } }), onSuccess: invalidateJobs, onError: (error: Error) => toast.error(error.message) });
  const taskArchiveMut = useMutation({ mutationFn: (value: { taskId: string; archived: boolean }) => setTaskArchived({ data: { brandId, taskId: value.taskId, archived: value.archived } }), onSuccess: invalidateTasks, onError: (error: Error) => toast.error(error.message) });
  const taskDeleteMut = useMutation({ mutationFn: (taskId: string) => deleteTask({ data: { brandId, taskId } }), onSuccess: () => { setOpenTask(null); invalidateTasks(); }, onError: (error: Error) => toast.error(error.message) });
  const createTaskMut = useMutation({ mutationFn: () => createTask({ data: { brandId, projectId, jobId: openJobId, title: newTaskTitle.trim(), ...(newTaskDue ? { due_at: newTaskDue } : {}) } }), onSuccess: () => { setNewTaskTitle(""); setNewTaskDue(""); invalidateTasks(); }, onError: (error: Error) => toast.error(error.message) });
  const patchTaskMut = useMutation({ mutationFn: (value: { taskId: string; patch: Record<string, unknown> }) => updateTask({ data: { brandId, taskId: value.taskId, patch: value.patch as never } }), onSuccess: invalidateTasks, onError: (error: Error) => toast.error(error.message) });

  const jobMenu = (job: ProjectJob) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ações do job"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => setOpenJobId(job.id)}>Abrir job</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => duplicateJobMut.mutate(job.id)}><Copy className="mr-2 h-3.5 w-3.5" />Duplicar</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { const name = window.prompt("Renomear job", job.name); if (name?.trim()) patchJobMut.mutate({ jobId: job.id, patch: { name: name.trim() } }); }}>Renomear job</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { const hours = window.prompt("Estimativa do job em horas", job.estimated_minutes ? String(job.estimated_minutes / 60) : ""); if (hours == null) return; const value = Number(hours.replace(",", ".")); if (Number.isFinite(value) && value >= 0) patchJobMut.mutate({ jobId: job.id, patch: { estimated_minutes: Math.round(value * 60) } }); else toast.error("Informe uma estimativa válida."); }}>Definir estimativa</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => jobDoneMut.mutate({ jobId: job.id, done: !job.done_at })}>{job.done_at ? "Reabrir job" : "Concluir job"}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => jobArchiveMut.mutate({ jobId: job.id, archived: !job.archived_at })}>{job.archived_at ? <><ArchiveRestore className="mr-2 h-3.5 w-3.5" />Restaurar job</> : <><Archive className="mr-2 h-3.5 w-3.5" />Arquivar job</>}</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { if (window.confirm(`Excluir job "${job.name}"? As tarefas serão desvinculadas.`)) deleteJobMut.mutate(job.id); }}><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir job</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const taskActions = (task: JobTask) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ações da tarefa"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => taskArchiveMut.mutate({ taskId: task.id, archived: !task.archived_at })}>{task.archived_at ? <><ArchiveRestore className="mr-2 h-3.5 w-3.5" />Restaurar</> : <><Archive className="mr-2 h-3.5 w-3.5" />Arquivar</>}</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { if (window.confirm(`Excluir a tarefa "${task.title}"?`)) taskDeleteMut.mutate(task.id); }}><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const changeTaskStatus = (task: JobTask, status: TaskStatus) => patchTaskMut.mutate({ taskId: task.id, patch: { status, done: status === "done" } });
  const changeTaskWorkStatus = (task: JobTask, statusId: string | null) => {
    const custom = (taskStatusesQ.data ?? []).find((status) => status.id === statusId);
    patchTaskMut.mutate({ taskId: task.id, patch: { status_id: statusId, status: custom?.task_state ?? task.status, done: custom?.task_state === "done" } });
  };
  const onTaskDragEnd = (event: DragEndEvent) => {
    setDraggedTaskId(null);
    const target = String(event.over?.id ?? "");
    if (!target.startsWith("task-status:")) return;
    const status = target.slice("task-status:".length) as TaskStatus;
    if (!TASK_STATUSES.includes(status)) return;
    const task = currentJobTasks.find((item) => item.id === event.active.id);
    if (task && task.status !== status) changeTaskStatus(task, status);
  };

  return (
    <>
      <DashboardPanelSurface className="overflow-hidden">
        <div className="border-b border-border/60 bg-background/40 p-3">
          <div className="mb-2 flex min-w-0 items-center gap-1.5 px-1 font-mono text-[10px] uppercase text-muted-foreground"><span className="truncate">{projectName}</span><ChevronRight className="h-3 w-3" /><span className="text-foreground">Jobs & Pautas</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant={mode === "jobs" ? "secondary" : "outline"} className="h-auto justify-between rounded-md px-4 py-3 text-left" onClick={() => setMode("jobs")}><span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><List className="h-4 w-4" /></span><span><span className="block text-sm font-semibold">Jobs</span><span className="block text-[11px] font-normal text-muted-foreground">{jobs.length} frentes · {taskTotals.total} tarefas</span></span></span><ChevronRight className="h-4 w-4 shrink-0" /></Button>
            {hasPautas ? <Button variant="outline" className="h-auto justify-between rounded-md px-4 py-3 text-left" onClick={openPautas}><span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><Sparkles className="h-4 w-4" /></span><span><span className="block text-sm font-semibold">Pautas</span><span className="block text-[11px] font-normal text-muted-foreground">{pautasCount} {pautasCount === 1 ? "peça" : "peças"} de conteúdo</span></span></span><ChevronRight className="h-4 w-4 shrink-0" /></Button> : null}
          </div>
        </div>

        {mode === "overview" ? (
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <Button variant="outline" className="h-auto justify-between px-5 py-5 text-left" onClick={() => setMode("jobs")}><span><span className="block text-base font-semibold">Jobs</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{jobs.length} frentes · {taskTotals.total} tarefas</span></span><ChevronRight className="h-4 w-4" /></Button>
            {hasPautas ? <Button variant="outline" className="h-auto justify-between px-5 py-5 text-left" onClick={openPautas}><span className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-primary" /><span><span className="block text-base font-semibold">Pautas</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{pautasCount} {pautasCount === 1 ? "peça" : "peças"} de conteúdo</span></span></span><ChevronRight className="h-4 w-4" /></Button> : null}
          </div>
        ) : (
           <JobListView brandId={brandId} jobs={visibleJobs} statuses={statuses} stats={jobStats} rollups={timeRollups} team={team} taskTotals={taskTotals} visibility={visibility} search={search} loading={jobsQ.isLoading} menuFor={jobMenu} onSearchChange={setSearch} onVisibilityChange={setVisibility} onOpen={setOpenJobId} onCreate={(name, statusId) => createJobMut.mutateAsync({ name, statusId })} onStatusChange={(job, statusId) => patchJobMut.mutate({ jobId: job.id, patch: { status_id: statusId } })} onAssigneeChange={(job, assigneeId) => patchJobMut.mutate({ jobId: job.id, patch: { assignee_id: assigneeId } })} onDueChange={(job, dueAt) => patchJobMut.mutate({ jobId: job.id, patch: { due_at: dueAt } })} />
        )}
        {footer ? <div className="border-t border-border/60 bg-background/40 px-5 py-3">{footer}</div> : null}
      </DashboardPanelSurface>

      <JobDetailModal
        open={!!currentJob}
        onOpenChange={(open) => { if (!open) setOpenJobId(null); }}
        code={currentJob ? `#${currentJob.job_number}.1` : undefined}
        title={currentJob?.name ?? "Job"}
        done={!!currentJob?.done_at}
        onToggleDone={currentJob ? () => jobDoneMut.mutate({ jobId: currentJob.id, done: !currentJob.done_at }) : undefined}
        breadcrumb={<>{clientName ? <span className="truncate">{clientName}</span> : null}{clientName ? <ChevronRight className="h-3 w-3" /> : null}<span className="truncate font-medium text-foreground">{projectName}</span></>}
        controls={currentJob ? <><AssigneePicker value={currentJob.assignee_id} options={team} className="h-9 w-[170px]" onChange={(assigneeId) => patchJobMut.mutate({ jobId: currentJob.id, patch: { assignee_id: assigneeId } })} /><DueDateChip value={currentJob.due_at} overdue={isOverdue(currentJob.due_at, !!currentJob.done_at)} onChange={(dueAt) => patchJobMut.mutate({ jobId: currentJob.id, patch: { due_at: dueAt } })} /><JobTimerWidget brandId={brandId} jobId={currentJob.id} estimatedMinutes={currentJob.estimated_minutes} /><StatusPicker brandId={brandId} scope="job" value={currentJob.status_id} className="h-9 w-[170px] rounded-full" onChange={(statusId) => patchJobMut.mutate({ jobId: currentJob.id, patch: { status_id: statusId } })} /></> : null}
        collaborators={currentJob ? <div className="hidden items-center sm:flex">{Array.from(new Set([currentJob.assignee_id, ...currentStats.assignees].filter((id): id is string => !!id))).slice(0, 4).map((id, index) => <AssigneeAvatar key={id} userId={id} options={team} className={cn("h-7 w-7 border-2 border-background", index > 0 && "-ml-2")} />)}</div> : null}
        share={currentJob ? <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Compartilhar job" title="Copiar link do job" onClick={async () => { const url = new URL(window.location.href); url.searchParams.set("tab", "jobs"); url.searchParams.set("job", currentJob.id); await navigator.clipboard.writeText(url.toString()); toast.success("Link do job copiado"); }}><Share2 className="h-4 w-4" /></Button> : null}
        menu={currentJob ? jobMenu(currentJob) : null}
        timeline={currentJob ? <div className="space-y-2"><div className="flex items-center justify-between gap-3 text-[11px]"><span>{shortDate(currentJob.start_date)}</span><span className={cn("font-medium", currentJob.due_at && isOverdue(currentJob.due_at, !!currentJob.done_at) ? "text-destructive" : "text-muted-foreground")}>{timeline.label}</span><span>{shortDate(currentJob.due_at)}</span></div><div className="relative"><Progress value={timeline.percent} className="h-2" /><span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground" style={{ left: `${timeline.percent}%` }} /></div><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Hoje · {timeline.percent}% do período</span><div className="flex gap-2"><Input type="date" className="h-8 w-[132px] text-xs" aria-label="Início do job" defaultValue={dateOnly(currentJob.start_date) ?? ""} onBlur={(event) => patchJobMut.mutate({ jobId: currentJob.id, patch: { start_date: event.target.value || null } })} /><Input type="date" className="h-8 w-[132px] text-xs" aria-label="Entrega do job" defaultValue={dateOnly(currentJob.due_at) ?? ""} onBlur={(event) => patchJobMut.mutate({ jobId: currentJob.id, patch: { due_at: event.target.value || null } })} /></div></div></div> : null}
        main={<div className="pb-6"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3"><div><span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Tarefas</span><span className="ml-2 text-[11px] tabular-nums text-muted-foreground">Abertas {openTasksCount}/{currentJobTasks.length} · {formatMinutes(currentStats.minutes)}</span></div><div className="flex flex-wrap items-center gap-1"><div className="relative"><Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" /><Input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Buscar tarefas" className="h-8 w-36 pl-7 text-xs" /></div><Select value={taskSort} onValueChange={(value) => setTaskSort(value as typeof taskSort)}><SelectTrigger className="h-8 w-28 text-xs" aria-label="Ordenar tarefas"><ArrowUpDown className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="position">Ordem</SelectItem><SelectItem value="due">Prazo</SelectItem><SelectItem value="name">Nome</SelectItem></SelectContent></Select><div className="flex rounded-md bg-muted p-0.5"><Button size="sm" variant={taskView === "list" ? "secondary" : "ghost"} className="h-7 gap-1 px-2 text-[11px]" onClick={() => setTaskView("list")}><List className="h-3 w-3" />Lista</Button><Button size="sm" variant={taskView === "board" ? "secondary" : "ghost"} className="h-7 gap-1 px-2 text-[11px]" onClick={() => setTaskView("board")}><Kanban className="h-3 w-3" />Quadro</Button></div><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Filtros de tarefas"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><VisibilityMenuBlock value={taskVisibility} onChange={setTaskVisibility} label="Exibir tarefas" withSeparator={false} /><DueMenuBlock value={dueFilter} onChange={setDueFilter} label="Prazo" /></DropdownMenuContent></DropdownMenu></div></div>{tasksQ.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : taskView === "board" ? <DndContext sensors={sensors} onDragStart={(event) => setDraggedTaskId(String(event.active.id))} onDragEnd={onTaskDragEnd} onDragCancel={() => setDraggedTaskId(null)}><div className="flex gap-3 overflow-x-auto p-4">{TASK_STATUSES.map((status) => <TaskBoardColumn key={status} status={status} tasks={currentJobTasks.filter((task) => task.status === status)} team={team} onOpen={setOpenTask} />)}</div><DragOverlay>{draggedTaskId ? <TaskBoardCard task={currentJobTasks.find((task) => task.id === draggedTaskId) ?? currentJobTasks[0]} team={team} onOpen={() => {}} /> : null}</DragOverlay></DndContext> : currentJobTasks.length === 0 ? <div className="p-10 text-center text-xs text-muted-foreground">Nenhuma tarefa neste job.</div> : <div className="divide-y divide-border/60">{currentJobTasks.map((task) => <div key={task.id} className="grid grid-cols-[auto_minmax(150px,1fr)] items-center gap-2 px-4 py-3 xl:grid-cols-[auto_minmax(150px,1fr)_125px_110px_auto_auto_auto]"><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={isItemDone(task) ? "Reabrir tarefa" : "Concluir tarefa"} onClick={() => changeTaskStatus(task, isItemDone(task) ? "todo" : "done")}>{isItemDone(task) ? <CheckCircle2 className="h-4 w-4 text-work-done" /> : <span className="h-4 w-4 rounded-full border border-border" />}</Button><Button variant="ghost" className="h-auto min-w-0 justify-start p-0 text-left" onClick={() => setOpenTask(task)}><span className={cn("truncate text-sm", isItemDone(task) && "line-through text-muted-foreground")}>{task.title}</span></Button><StatusPicker brandId={brandId} scope="task" value={task.status_id} className="h-8 w-[125px] border-dashed text-xs" placeholder="+ status" onChange={(statusId) => changeTaskWorkStatus(task, statusId)} /><Select value={task.priority} onValueChange={(priority) => patchTaskMut.mutate({ taskId: task.id, patch: { priority: priority as TaskPriority } })}><SelectTrigger className="h-8 text-xs" aria-label="Prioridade"><SelectValue /></SelectTrigger><SelectContent>{TASK_PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{PRIORITY_META[priority].label}</SelectItem>)}</SelectContent></Select><AssigneePicker compact value={task.assignee_id} options={team} placeholder="Sem responsável" onChange={(assigneeId) => patchTaskMut.mutate({ taskId: task.id, patch: { assignee_id: assigneeId } })} /><DueDateChip value={task.due_at} overdue={isOverdue(task.due_at, isItemDone(task))} onChange={(dueAt) => patchTaskMut.mutate({ taskId: task.id, patch: { due_at: dueAt } })} /><div className="flex items-center"><TaskTimerWidget brandId={brandId} taskId={task.id} estimatedMinutes={task.estimated_minutes} compact /><TaskSubtasksPopover taskId={task.id} />{taskActions(task)}</div></div>)}</div>}<div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3"><Input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && newTaskTitle.trim()) createTaskMut.mutate(); }} placeholder="Adicionar uma tarefa…" className="h-9 min-w-[220px] flex-1" /><Input type="date" value={newTaskDue} onChange={(event) => setNewTaskDue(event.target.value)} className="h-9 w-[135px] text-xs" aria-label="Prazo opcional" /><Button size="sm" className="h-9" onClick={() => createTaskMut.mutate()} disabled={!newTaskTitle.trim()}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar</Button></div><JobBriefingEditor key={currentJob?.id} value={currentJob?.description ?? null} onSave={(description) => currentJob ? patchJobMut.mutateAsync({ jobId: currentJob.id, patch: { description } }) : Promise.resolve()} /></div>}
        aside={currentJob ? <ContextTabs className="h-full" tabs={[{ value: "comments", label: "Comentários", content: <CommentThread brandId={brandId} level="job" projectId={projectId} jobId={currentJob.id} currentUserId={currentUserId} placeholder="Insira seu comentário aqui" /> }, { value: "links", label: "Anexos", content: <WorkLinks target="job" targetId={currentJob.id} title="Anexos e links do job" /> }, { value: "timesheet", label: "Timesheet", content: <JobTimesheetPanel brandId={brandId} jobId={currentJob.id} estimatedMinutes={currentJob.estimated_minutes} /> }, { value: "history", label: "Histórico", content: <JobHistoryPanel brandId={brandId} jobId={currentJob.id} /> }]} /> : null}
      />

      <TaskTimesheetSheet open={!!openTask} onOpenChange={(open) => { if (!open) setOpenTask(null); }} brandId={brandId} breadcrumb={clientName ? `${clientName} › ${projectName} › ${currentJob?.name ?? "Job"}` : `${projectName} › ${currentJob?.name ?? "Job"}`} team={team} currentUserId={currentUserId} onToggleDone={openTask ? () => changeTaskStatus(openTask, isItemDone(openTask) ? "todo" : "done") : undefined} taskDone={!!openTask && isItemDone(openTask)} task={openTask ? { id: openTask.id, title: openTask.title, estimated_minutes: openTask.estimated_minutes, total_minutes: openTask.total_minutes, assignee_id: openTask.assignee_id, status_id: openTask.status_id, start_date: openTask.start_date, due_at: openTask.due_at, status: openTask.status, priority: openTask.priority } : null} />

      <div className="sr-only" aria-live="polite">{patchTaskMut.isPending ? "Atualizando tarefa" : ""}</div>
      {pautasOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"><DashboardPanelSurface className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden"><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">Pautas ({pautasCount})</h2></div><div className="flex gap-2">{onCreatePauta ? <Button size="sm" onClick={onCreatePauta}><Plus className="mr-1 h-3.5 w-3.5" />Nova pauta</Button> : null}<Button size="sm" variant="ghost" onClick={() => setPautasOpen(false)}>Fechar</Button></div></div><div className="overflow-y-auto p-5">{pautasContent}</div></DashboardPanelSurface></div> : null}
    </>
  );
}
