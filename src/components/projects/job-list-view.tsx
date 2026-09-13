import { useMemo, useState, type ReactNode } from "react";
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
import {
  Archive,
  ArrowUpDown,
  CheckSquare2,
  Clock3,
  Kanban,
  List,
  Plus,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { JobTimeRollup, ProjectJob } from "@/lib/project-jobs.functions";
import { formatMinutes } from "@/lib/timesheet.functions";
import { addDaysInTz, isoDateInTz } from "@/lib/timezone";
import type { VisibilityFilter } from "@/lib/work-visibility";
import { VISIBILITY_LABELS } from "@/lib/work-visibility";
import type { WorkStatus } from "@/lib/work-statuses.functions";
import { cn } from "@/lib/utils";
import { AssigneeAvatar, AssigneePicker, optionName, type TeamOption } from "./assignee-picker";
import { DueDateChip } from "./due-date-chip";
import { StatusDot, StatusPicker } from "./status-picker";
import { VisibilityMenuBlock } from "./work-filter-menu";
import { isOverdue } from "./work-item-row";

export type JobListStats = { total: number; done: number; minutes: number; assignees: string[] };
type GroupBy = "status" | "assignee" | "due";
type ViewMode = "list" | "board";

type Props = {
  brandId: string;
  jobs: ProjectJob[];
  statuses: WorkStatus[];
  stats: Map<string, JobListStats>;
  rollups: Map<string, JobTimeRollup>;
  team: TeamOption[];
  taskTotals: { total: number; done: number };
  visibility: VisibilityFilter;
  search: string;
  loading: boolean;
  menuFor: (job: ProjectJob) => ReactNode;
  onSearchChange: (value: string) => void;
  onVisibilityChange: (value: VisibilityFilter) => void;
  onOpen: (jobId: string) => void;
  onCreate: (name: string, statusId?: string | null) => Promise<unknown>;
  onStatusChange: (job: ProjectJob, statusId: string | null) => void;
  onAssigneeChange: (job: ProjectJob, assigneeId: string | null) => void;
  onDueChange: (job: ProjectJob, dueAt: string | null) => void;
};

function avatarIds(job: ProjectJob, stats: JobListStats) {
  return Array.from(new Set([job.assignee_id, ...stats.assignees].filter((id): id is string => !!id))).slice(0, 4);
}

function JobAvatars({ job, stats, team }: { job: ProjectJob; stats: JobListStats; team: TeamOption[] }) {
  const ids = avatarIds(job, stats);
  if (!ids.length) return <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground">—</span>;
  return <div className="flex">{ids.map((id, index) => <AssigneeAvatar key={id} userId={id} options={team} className={cn("h-7 w-7 border-2 border-background", index > 0 && "-ml-2")} />)}</div>;
}

function ProgressCell({ stats, color }: { stats: JobListStats; color?: string | null }) {
  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  return (
    <div className="min-w-[106px]">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground"><CheckSquare2 className="h-3.5 w-3.5" /><span><strong className="font-semibold text-work-done">{stats.done}</strong>/{stats.total}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-[width]" style={{ width: `${percent}%`, backgroundColor: color ?? "var(--primary)" }} /></div>
    </div>
  );
}

function JobRow({ brandId, job, stats, rollup, status, team, onOpen, onStatusChange, onAssigneeChange, onDueChange, menu }: {
  brandId: string; job: ProjectJob; stats: JobListStats; rollup?: JobTimeRollup; status?: WorkStatus; team: TeamOption[]; onOpen: () => void; onStatusChange: (id: string | null) => void; onAssigneeChange: (id: string | null) => void; onDueChange: (value: string | null) => void; menu: ReactNode;
}) {
  const minutes = rollup?.minutes ?? stats.minutes;
  return (
    <div className="grid min-h-16 grid-cols-[auto_minmax(150px,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border/50 px-3 py-2.5 last:border-b-0 lg:grid-cols-[auto_minmax(180px,1fr)_118px_82px_98px_106px_158px_auto]">
      <Badge variant="secondary" className="h-6 rounded-md border border-primary/15 bg-primary/10 font-mono text-[10px] font-semibold tabular-nums text-primary">#{job.job_number}.1</Badge>
      <Button variant="ghost" className="h-auto min-w-0 justify-start p-0 text-left" onClick={onOpen}><span className="truncate text-sm font-semibold">{job.name}</span></Button>
      <div className="hidden lg:block"><ProgressCell stats={stats} color={status?.color} /></div>
      <div className={cn("hidden items-center gap-1.5 text-xs tabular-nums lg:flex", rollup?.running ? "font-medium text-work-done" : "text-muted-foreground")}><Clock3 className={cn("h-3.5 w-3.5", rollup?.running && "animate-pulse")} />{formatMinutes(minutes)}</div>
      <div className="hidden items-center justify-center lg:flex"><AssigneePicker compact value={job.assignee_id} options={team} placeholder="Sem responsável" onChange={onAssigneeChange} />{stats.assignees.filter((id) => id !== job.assignee_id).slice(0, 2).map((id) => <AssigneeAvatar key={id} userId={id} options={team} className="-ml-2 h-7 w-7 border-2 border-background" />)}</div>
      <div className="hidden lg:block"><DueDateChip value={job.due_at} overdue={isOverdue(job.due_at, !!job.done_at)} onChange={onDueChange} /></div>
      <div className="hidden lg:block"><StatusPicker brandId={brandId} scope="job" value={job.status_id} className="h-8 w-[158px] rounded-full bg-background text-xs" onChange={onStatusChange} /></div>
      <div className="flex items-center justify-end">{menu}</div>
      <div className="col-span-3 grid grid-cols-[1fr_auto_auto] items-center gap-3 lg:hidden"><ProgressCell stats={stats} color={status?.color} /><div className={cn("flex items-center gap-1 text-xs tabular-nums", rollup?.running ? "font-medium text-work-done" : "text-muted-foreground")}><Clock3 className={cn("h-3.5 w-3.5", rollup?.running && "animate-pulse")} />{formatMinutes(minutes)}</div><JobAvatars job={job} stats={stats} team={team} /><div className="col-span-2"><StatusPicker brandId={brandId} scope="job" value={job.status_id} className="h-8 w-full max-w-[180px] rounded-full bg-background text-xs" onChange={onStatusChange} /></div><DueDateChip value={job.due_at} overdue={isOverdue(job.due_at, !!job.done_at)} onChange={onDueChange} /></div>
    </div>
  );
}

function JobBoardCard({ job, stats, rollup, status, team, menu, onOpen }: { job: ProjectJob; stats: JobListStats; rollup?: JobTimeRollup; status?: WorkStatus; team: TeamOption[]; menu: ReactNode; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article ref={setNodeRef} style={style} {...attributes} {...listeners} className={cn("cursor-grab rounded-md border border-border/60 bg-background p-3 shadow-sm transition-shadow hover:shadow-md", isDragging && "opacity-40")}>
      <div className="flex items-start gap-2"><Badge variant="secondary" className="mt-0.5 rounded-md border border-primary/15 bg-primary/10 font-mono text-[9px] text-primary">#{job.job_number}.1</Badge><Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start p-0 text-left" onClick={onOpen}><span className="line-clamp-2 text-sm font-semibold">{job.name}</span></Button>{menu}</div>
      <div className="mt-3"><ProgressCell stats={stats} color={status?.color} /></div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span className={cn("flex items-center gap-1", rollup?.running && "text-work-done")}><Clock3 className="h-3 w-3" />{formatMinutes(rollup?.minutes ?? stats.minutes)}</span><JobAvatars job={job} stats={stats} team={team} /></div>
    </article>
  );
}

function BoardColumn({ status, jobs, renderCard }: { status: WorkStatus | null; jobs: ProjectJob[]; renderCard: (job: ProjectJob) => ReactNode }) {
  const key = status?.id ?? "none";
  const { setNodeRef, isOver } = useDroppable({ id: `job-status:${key}` });
  return (
    <section className="flex w-[278px] shrink-0 flex-col overflow-hidden rounded-md border border-border/60 bg-muted/20">
      <header className="flex items-center gap-2 border-b border-border/60 bg-background/70 px-3 py-3"><StatusDot color={status?.color ?? null} /><h3 className="truncate text-[11px] font-semibold uppercase text-foreground">{status?.name ?? "Sem status"}</h3><Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">{jobs.length}</Badge></header>
      <div ref={setNodeRef} className={cn("flex min-h-56 flex-1 flex-col gap-2 p-2", isOver && "bg-primary/5")}>{jobs.map(renderCard)}{jobs.length === 0 ? <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border/60 p-5 text-[11px] text-muted-foreground">Nenhum job</div> : null}</div>
    </section>
  );
}

function dueGroup(job: ProjectJob) {
  if (!job.due_at) return "none";
  const due = job.due_at.slice(0, 10);
  const today = isoDateInTz();
  if (due < today && !job.done_at) return "overdue";
  if (due === today) return "today";
  if (due <= isoDateInTz(addDaysInTz(new Date(), 7))) return "soon";
  return "future";
}

export function JobListView(props: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [view, setView] = useState<ViewMode>("list");
  const [addingTo, setAddingTo] = useState<string | null | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const statusMap = useMemo(() => new Map(props.statuses.map((status) => [status.id, status])), [props.statuses]);
  const completedJobs = props.jobs.filter((job) => !!job.done_at || statusMap.get(job.status_id ?? "")?.is_done).length;

  const groups = useMemo(() => {
    if (groupBy === "status") return [
      ...props.statuses.map((status) => ({ key: status.id, label: status.name, color: status.color, jobs: props.jobs.filter((job) => job.status_id === status.id), statusId: status.id })),
      { key: "none", label: "Sem status", color: null, jobs: props.jobs.filter((job) => !job.status_id), statusId: null },
    ];
    if (groupBy === "assignee") {
      const present = new Set(props.jobs.map((job) => job.assignee_id).filter((id): id is string => !!id));
      return [...Array.from(present).map((id) => ({ key: id, label: optionName(props.team.find((person) => person.user_id === id) ?? { user_id: id, full_name: null }), color: null, jobs: props.jobs.filter((job) => job.assignee_id === id), statusId: undefined })), { key: "none", label: "Sem responsável", color: null, jobs: props.jobs.filter((job) => !job.assignee_id), statusId: undefined }];
    }
    const labels = { overdue: "Atrasados", today: "Hoje", soon: "Próximos 7 dias", future: "Futuros", none: "Sem prazo" };
    return Object.entries(labels).map(([key, label]) => ({ key, label, color: null, jobs: props.jobs.filter((job) => dueGroup(job) === key), statusId: undefined }));
  }, [groupBy, props.jobs, props.statuses, props.team]);

  const create = async () => {
    if (!newName.trim()) return;
    await props.onCreate(newName.trim(), addingTo);
    setNewName("");
    setAddingTo(undefined);
  };
  const renderMenu = (job: ProjectJob) => <span onPointerDown={(event) => event.stopPropagation()}>{props.menuFor(job)}</span>;
  const renderCard = (job: ProjectJob) => <JobBoardCard key={job.id} job={job} stats={props.stats.get(job.id) ?? { total: 0, done: 0, minutes: 0, assignees: [] }} rollup={props.rollups.get(job.id)} status={statusMap.get(job.status_id ?? "")} team={props.team} menu={renderMenu(job)} onOpen={() => props.onOpen(job.id)} />;
  const onDragEnd = (event: DragEndEvent) => {
    setDraggedId(null);
    const target = String(event.over?.id ?? "");
    const job = props.jobs.find((item) => item.id === String(event.active.id));
    if (!job || !target.startsWith("job-status:")) return;
    const raw = target.slice("job-status:".length);
    const statusId = raw === "none" ? null : raw;
    if (job.status_id !== statusId) props.onStatusChange(job, statusId);
  };

  return (
    <div>
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0"><h2 className="text-base font-semibold">Jobs</h2><p className="text-[11px] text-muted-foreground">{completedJobs}/{props.jobs.length} jobs concluídos · {props.taskTotals.done}/{props.taskTotals.total} tarefas concluídas</p></div>
          <div className="relative min-w-[180px] flex-1 sm:max-w-[250px]"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Buscar nome ou número" className="h-9 pl-8 text-xs" /></div>
           <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}><SelectTrigger className="h-9 w-[174px] text-xs" aria-label="Agrupar jobs"><ArrowUpDown className="mr-1 h-3.5 w-3.5" /><span className="mr-1 text-muted-foreground">Agrupar por:</span><SelectValue /></SelectTrigger><SelectContent><SelectItem value="status">Status</SelectItem><SelectItem value="assignee">Responsável</SelectItem><SelectItem value="due">Prazo</SelectItem></SelectContent></Select>
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant={props.visibility === "active" ? "outline" : "secondary"} className="h-9 gap-1.5 text-xs"><Archive className="h-3.5 w-3.5" />{VISIBILITY_LABELS[props.visibility]}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><VisibilityMenuBlock value={props.visibility} onChange={props.onVisibilityChange} label="Exibir jobs" withSeparator={false} /></DropdownMenuContent></DropdownMenu>
           <div className="flex h-9 rounded-md border border-border bg-muted/30 p-0.5"><Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => setView("list")} aria-label="Lista"><List className="h-3.5 w-3.5" />Lista</Button><Button size="sm" variant={view === "board" ? "secondary" : "ghost"} className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => setView("board")} aria-label="Quadro"><Kanban className="h-3.5 w-3.5" />Quadro</Button></div>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddingTo(null)}><Plus className="h-3.5 w-3.5" />Novo job</Button>
        </div>
      </div>

      {addingTo !== undefined ? <div className="flex flex-wrap gap-2 border-b border-border/60 bg-muted/20 p-3"><Input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); if (event.key === "Escape") setAddingTo(undefined); }} placeholder="Nome do novo job" className="h-9 min-w-[220px] flex-1" /><Button size="sm" className="h-9" disabled={!newName.trim()} onClick={() => void create()}>Criar</Button><Button size="sm" variant="ghost" className="h-9" onClick={() => setAddingTo(undefined)}>Cancelar</Button></div> : null}
      {props.loading ? <div className="space-y-2 p-4"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : props.jobs.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">Nenhum job encontrado.</div> : view === "board" ? (
        <DndContext sensors={sensors} onDragStart={(event) => setDraggedId(String(event.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDraggedId(null)}><div className="flex gap-3 overflow-x-auto p-4">{[...props.statuses.map((status) => ({ status, jobs: props.jobs.filter((job) => job.status_id === status.id) })), { status: null, jobs: props.jobs.filter((job) => !job.status_id) }].map(({ status, jobs }) => <BoardColumn key={status?.id ?? "none"} status={status} jobs={jobs} renderCard={renderCard} />)}</div><DragOverlay>{draggedId ? renderCard(props.jobs.find((job) => job.id === draggedId) ?? props.jobs[0]) : null}</DragOverlay></DndContext>
      ) : <div className="space-y-4 bg-muted/10 p-3">{groups.map((group) => <section key={group.key}><header className="flex items-center gap-2 px-1 py-2"><StatusDot color={group.color} /><h3 className="text-[11px] font-semibold uppercase text-muted-foreground">{group.label}</h3><Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">{group.jobs.length}</Badge>{groupBy === "status" ? <Button size="icon" variant="ghost" className="ml-auto h-6 w-6" title={`Adicionar job em ${group.label}`} aria-label={`Adicionar job em ${group.label}`} onClick={() => setAddingTo(group.statusId)}><Plus className="h-3.5 w-3.5" /></Button> : null}</header><div className="overflow-hidden rounded-md border border-border/60 bg-background">{group.jobs.map((job) => <JobRow key={job.id} brandId={props.brandId} job={job} stats={props.stats.get(job.id) ?? { total: 0, done: 0, minutes: 0, assignees: [] }} rollup={props.rollups.get(job.id)} status={statusMap.get(job.status_id ?? "")} team={props.team} onOpen={() => props.onOpen(job.id)} onStatusChange={(id) => props.onStatusChange(job, id)} onAssigneeChange={(id) => props.onAssigneeChange(job, id)} onDueChange={(value) => props.onDueChange(job, value)} menu={props.menuFor(job)} />)}{group.jobs.length === 0 ? <div className="px-4 py-5 text-xs text-muted-foreground">Nenhum job neste grupo.</div> : null}</div></section>)}<Button variant="outline" className="h-11 w-full justify-start border-dashed bg-background px-4 text-xs text-muted-foreground" onClick={() => setAddingTo(null)}><Plus className="mr-2 h-3.5 w-3.5" />Adicionar um job</Button></div>}
    </div>
  );
}