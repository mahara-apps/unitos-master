import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  CalendarClock,
  User as UserIcon,
  ListTodo,
  Kanban,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DashboardPageShell,
  DashboardPanelSurface,
} from "@/components/ui/dashboard-primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { listTasksFn, listProjectsFn } from "@/lib/tasks.functions";
import { listBrandAssigneesFn } from "@/lib/content.functions";
import { listClients } from "@/lib/workspace.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  CreateTaskDialog,
  TaskDrawer,
  isOverdue,
} from "@/components/tasks/shared";
import {
  DEFAULT_VISIBLE_COLUMNS,
  TaskTable,
  type GroupBy,
  type SortDir,
  type SortKey,
  type VisibleColumns,
} from "@/components/tasks/task-table";
import { TaskKanban } from "@/components/tasks/task-kanban";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import {
  DEFAULT_FILTERS,
  TaskToolbar,
  applyFilters,
  type TaskFilters,
} from "@/components/tasks/task-toolbar";
import { Plus } from "lucide-react";

const VIEWS = ["list", "kanban", "calendar", "mine"] as const;
type View = (typeof VIEWS)[number];

const searchSchema = z.object({
  view: z.enum(VIEWS).catch("list"),
  taskId: z.string().uuid().optional(),
  groupBy: z
    .enum(["none", "status", "priority", "project", "client", "assignee"])
    .catch("status"),
  sort: z
    .enum(["title", "assignee", "project", "client", "priority", "status", "due", "created"])
    .catch("created"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  validateSearch: searchSchema,
});

const VIEW_META: Record<View, { label: string; icon: typeof ListTodo }> = {
  list: { label: "Lista", icon: ListTodo },
  kanban: { label: "Kanban", icon: Kanban },
  calendar: { label: "Calendário", icon: CalendarDays },
  mine: { label: "Minhas tarefas", icon: UserIcon },
};

// ---------- Style maps ----------

const STATUS_META: Record<TaskStatus, { label: string; icon: typeof Circle; badge: string; dot: string }> = {
  todo: {
    label: "A fazer",
    icon: Circle,
    badge: "border-border/60 bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  in_progress: {
    label: "Em progresso",
    icon: Clock,
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  review: {
    label: "Revisão",
    icon: AlertTriangle,
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  done: {
    label: "Concluída",
    icon: CheckCircle2,
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
};

const PRIORITY_META: Record<TaskPriority, { label: string; icon: typeof ArrowDown; badge: string }> = {
  low: {
    label: "Baixa",
    icon: ArrowDown,
    badge: "border-border/60 bg-muted text-muted-foreground",
  },
  medium: {
    label: "Média",
    icon: ArrowUp,
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  high: {
    label: "Alta",
    icon: ArrowUp,
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  urgent: {
    label: "Urgente",
    icon: Flame,
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function relativeDue(iso: string | null): { label: string; tone: string } | null {
  if (!iso) return null;
  const now = new Date();
  const d = new Date(iso);
  const diffMs = d.getTime() - now.getTime();
  const days = Math.round(diffMs / 86_400_000);
  const label = format(d, "d 'de' MMM", { locale: ptBR });
  if (days < 0) return { label: `${label} · atrasada`, tone: "text-rose-600 dark:text-rose-400" };
  if (days === 0) return { label: `${label} · hoje`, tone: "text-amber-600 dark:text-amber-400" };
  if (days <= 3) return { label, tone: "text-amber-600 dark:text-amber-400" };
  return { label, tone: "text-muted-foreground" };
}

// ---------- Page ----------

function TasksPage() {
  const { brandId, clientId } = useActiveContext();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  const listTasks = useServerFn(listTasksFn);
  const listAssignees = useServerFn(listBrandAssigneesFn);
  const listClientsFn = useServerFn(listClients);
  const listProjects = useServerFn(listProjectsFn);

  const [createOpen, setCreateOpen] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<VisibleColumns>(DEFAULT_VISIBLE_COLUMNS);
  const [filters, setFilters] = useState<TaskFilters>({
    ...DEFAULT_FILTERS,
    search: search.q ?? "",
  });

  const view: View = search.view;
  const groupBy: GroupBy = search.groupBy;
  const sortKey: SortKey = search.sort;
  const sortDir: SortDir = search.dir;
  const openTaskId = search.taskId ?? null;

  function setSearch(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setMe(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const invalidateKey = ["tasks", brandId, clientId] as const;

  const tasksQ = useQuery({
    queryKey: invalidateKey,
    queryFn: () => listTasks({ data: { brandId: brandId!, clientId: clientId ?? null } }),
    enabled: !!brandId,
  });

  const tasks = tasksQ.data ?? [];

  const assigneesQ = useQuery({
    queryKey: ["brand-assignees", brandId],
    queryFn: () => listAssignees({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });
  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => listClientsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });
  const projectsQ = useQuery({
    queryKey: ["projects", brandId],
    queryFn: () => listProjects({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });

  // Effective filters: "mine" view forces assigneeId=me
  const effectiveFilters: TaskFilters = useMemo(
    () => (view === "mine" ? { ...filters, assigneeId: "me" } : filters),
    [filters, view],
  );

  const filtered = useMemo(
    () => applyFilters(tasks, effectiveFilters, me),
    [tasks, effectiveFilters, me],
  );

  const kpis = useMemo(() => {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    const mine = me ? tasks.filter((t) => t.assignee_id === me && t.status !== "done").length : 0;
    const dueToday = tasks.filter((t) => {
      if (!t.due_at || t.status === "done") return false;
      const time = new Date(t.due_at).getTime();
      return time >= startOfDay.getTime() && time <= endOfDay.getTime();
    }).length;
    return { total, inProgress, done, overdue, mine, dueToday, now };
  }, [tasks, me]);

  usePageHeader(
    {
      title: "Tarefas",
      subtitle: "Trabalho da equipe · atribuições, prazos e discussões",
      actions: brandId ? (
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
        </Button>
      ) : null,
    },
    [brandId],
  );

  if (!brandId) {
    return (
      <DashboardPageShell>
        <DashboardPanelSurface>
          <PanelEmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            text="Selecione uma workspace no seletor lateral para carregar as tarefas."
          />
        </DashboardPanelSurface>
      </DashboardPageShell>
    );
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: invalidateKey });

  return (
    <DashboardPageShell>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total" value={kpis.total} icon={<Circle className="h-4 w-4" />} tone="neutral" />
        <KpiCard
          label="Em andamento"
          value={kpis.inProgress}
          icon={<Clock className="h-4 w-4" />}
          tone="sky"
        />
        <KpiCard
          label="Atrasadas"
          value={kpis.overdue}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
        />
        <KpiCard
          label="Concluídas"
          value={kpis.done}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Minha carga"
          value={kpis.mine}
          icon={<UserIcon className="h-4 w-4" />}
          tone="violet"
        />
        <KpiCard
          label="Prazo hoje"
          value={kpis.dueToday}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="amber"
        />
      </div>

      {/* Views */}
      <Tabs value={view} onValueChange={(v) => setSearch({ view: v as View })}>
        <TabsList className="h-9">
          {VIEWS.map((v) => {
            const meta = VIEW_META[v];
            const Icon = meta.icon;
            return (
              <TabsTrigger key={v} value={v} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Toolbar */}
      <TaskToolbar
        filters={filters}
        onFiltersChange={(next) => {
          setFilters(next);
          setSearch({ q: next.search || undefined });
        }}
        groupBy={groupBy}
        onGroupByChange={(g) => setSearch({ groupBy: g })}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(k, d) => setSearch({ sort: k, dir: d })}
        columns={columns}
        onColumnsChange={setColumns}
        onNewTask={() => setCreateOpen(true)}
        tasksToExport={filtered}
        assignees={assigneesQ.data ?? []}
        clients={clientsQ.data ?? []}
        projects={projectsQ.data ?? []}
      />

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold">{selectedIds.size}</span>
          <span className="text-muted-foreground">selecionada(s)</span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Views body */}
      {tasksQ.isLoading ? (
        <DashboardPanelSurface className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando tarefas...
        </DashboardPanelSurface>
      ) : filtered.length === 0 ? (
        <DashboardPanelSurface>
          <PanelEmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            text="Nenhuma tarefa encontrada com os filtros atuais."
          />
          <div className="flex justify-center pb-8">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        </DashboardPanelSurface>
      ) : view === "kanban" ? (
        <TaskKanban tasks={filtered} onOpenTask={(id) => setSearch({ taskId: id })} onChanged={invalidate} />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={filtered} onOpenTask={(id) => setSearch({ taskId: id })} />
      ) : (
        <TaskTable
          brandId={brandId}
          tasks={filtered}
          columns={columns}
          groupBy={groupBy}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(k) =>
            setSearch({ sort: k, dir: sortKey === k && sortDir === "asc" ? "desc" : "asc" })
          }
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onOpenTask={(id) => setSearch({ taskId: id })}
          onChanged={invalidate}
        />
      )}

      {createOpen ? (
        <CreateTaskDialog
          brandId={brandId}
          clientId={clientId ?? null}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            invalidate();
            setSearch({ taskId: id });
          }}
        />
      ) : null}

      {openTaskId ? (
        <TaskDrawer
          taskId={openTaskId}
          brandId={brandId}
          currentUserId={me}
          allTasks={filtered}
          onNavigate={(id) => setSearch({ taskId: id })}
          onClose={() => setSearch({ taskId: undefined })}
          onChanged={invalidate}
        />
      ) : null}
    </DashboardPageShell>
  );
}

// ---------- Row ----------

function TaskRowItem({
  task,
  onOpen,
  onQuickChange,
}: {
  task: TaskRow;
  onOpen: () => void;
  onQuickChange: () => void;
}) {
  const update = useServerFn(updateTaskFn);
  const remove = useServerFn(deleteTaskFn);
  const due = relativeDue(task.due_at);
  const priorityMeta = PRIORITY_META[task.priority];
  const statusMeta = STATUS_META[task.status];

  const toggleDone = useMutation({
    mutationFn: () =>
      update({ data: { taskId: task.id, patch: { done: task.status !== "done" } } }),
    onSuccess: () => onQuickChange(),
    onError: (e: Error) => toast.error(e.message),
  });
  const changeStatus = useMutation({
    mutationFn: (status: TaskStatus) =>
      update({ data: { taskId: task.id, patch: { status, done: status === "done" } } }),
    onSuccess: () => onQuickChange(),
  });
  const del = useMutation({
    mutationFn: () => remove({ data: { taskId: task.id } }),
    onSuccess: () => {
      toast.success("Tarefa excluída");
      onQuickChange();
    },
  });

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
      <button
        aria-label="Marcar como concluída"
        onClick={(e) => {
          e.stopPropagation();
          toggleDone.mutate();
        }}
        className="shrink-0"
      >
        {task.status === "done" ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
        )}
      </button>

      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className={cn(
            "truncate text-sm",
            task.status === "done" && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
        {task.comments_count && task.comments_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {task.comments_count}
          </span>
        ) : null}
      </button>

      <div className="hidden items-center gap-2 md:flex">
        {task.project_name ? (
          <span className="inline-flex max-w-[140px] items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Folder className="h-3 w-3" /> {task.project_name}
          </span>
        ) : null}
        {task.client_name ? (
          <Badge variant="outline" className="max-w-[140px] truncate text-[10px]">
            {task.client_name}
          </Badge>
        ) : null}
      </div>

      <Badge variant="outline" className={cn("hidden gap-1 text-[10px] md:inline-flex", priorityMeta.badge)}>
        <priorityMeta.icon className="h-3 w-3" />
        {priorityMeta.label}
      </Badge>

      <Select
        value={task.status}
        onValueChange={(v) => changeStatus.mutate(v as TaskStatus)}
      >
        <SelectTrigger
          className={cn("hidden h-7 w-[130px] text-[11px] md:flex", statusMeta.badge)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_META[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {due ? (
        <span className={cn("inline-flex items-center gap-1 text-[11px]", due.tone)}>
          <CalendarIcon className="h-3 w-3" /> {due.label}
        </span>
      ) : null}

      {task.assignee_id ? (
        <Avatar className="h-6 w-6">
          {task.assignee_avatar ? <AvatarImage src={task.assignee_avatar} /> : null}
          <AvatarFallback className="text-[10px]">{initials(task.assignee_name)}</AvatarFallback>
        </Avatar>
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground">
          ?
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>Abrir</DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              if (confirm("Excluir esta tarefa?")) del.mutate();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------- Create Dialog ----------

function CreateTaskDialog({
  brandId,
  clientId,
  open,
  onOpenChange,
  onCreated,
}: {
  brandId: string;
  clientId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const create = useServerFn(createTaskFn);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [taskClientId, setTaskClientId] = useState<string | null>(clientId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string>("");

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          brandId,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          assignee_id: assigneeId,
          client_id: taskClientId,
          project_id: projectId,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
        },
      }),
    onSuccess: (res) => {
      toast.success("Tarefa criada");
      onOpenChange(false);
      onCreated(res.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>
            Crie uma tarefa e atribua para alguém do time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Título</label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Aprovar copy do post de sexta"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Descrição</label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contexto, checklist rápido, links..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Prioridade</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Prazo</label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Responsável</label>
              <AssigneePicker
                brandId={brandId}
                value={assigneeId}
                onChange={setAssigneeId}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Conta / Cliente</label>
              <ClientPicker
                brandId={brandId}
                value={taskClientId}
                onChange={(id) => {
                  setTaskClientId(id);
                  setProjectId(null);
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Projeto</label>
            <ProjectPicker brandId={brandId} clientId={taskClientId} value={projectId} onChange={setProjectId} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!title.trim() || m.isPending}
          >
            {m.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail Sheet ----------

function TaskDetailSheet({
  taskId,
  brandId,
  currentUserId,
  onClose,
  onChanged,
}: {
  taskId: string;
  brandId: string;
  currentUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const listTasks = useServerFn(listTasksFn);
  const listComments = useServerFn(listTaskCommentsFn);
  const addComment = useServerFn(addTaskCommentFn);
  const deleteComment = useServerFn(deleteTaskCommentFn);
  const update = useServerFn(updateTaskFn);
  const del = useServerFn(deleteTaskFn);
  const listAssignees = useServerFn(listBrandAssigneesFn);

  const taskQ = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      // Reuse the list result to keep single source of truth
      const list = await listTasks({ data: { brandId, clientId: null } });
      return list.find((t) => t.id === taskId) ?? null;
    },
  });
  const commentsQ = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: () => listComments({ data: { taskId } }),
  });
  const membersQ = useQuery({
    queryKey: ["brand-assignees", brandId],
    queryFn: () => listAssignees({ data: { brandId } }),
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState<Partial<TaskRow>>({});
  useEffect(() => {
    if (taskQ.data) setDraft({ title: taskQ.data.title, description: taskQ.data.description });
  }, [taskQ.data]);

  const [comment, setComment] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);

  const patchMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateTaskFn>[0] extends undefined ? never : { taskId: string; patch: Record<string, unknown> }) =>
      update({ data: patch as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: () =>
      addComment({
        data: { taskId, body: comment.trim(), mentions: mentionUserIds },
      }),
    onSuccess: () => {
      setComment("");
      setMentionUserIds([]);
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeComment = useMutation({
    mutationFn: (commentId: string) => deleteComment({ data: { commentId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", taskId] }),
  });

  const removeTask = useMutation({
    mutationFn: () => del({ data: { taskId } }),
    onSuccess: () => {
      toast.success("Tarefa excluída");
      onChanged();
      onClose();
    },
  });

  const task = taskQ.data;
  const members = membersQ.data ?? [];

  // Detect trailing @token to open mention popover
  useEffect(() => {
    const m = /(^|\s)@([^\s@]{0,40})$/.exec(comment);
    if (m) {
      setMentionQuery(m[2] ?? "");
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }, [comment]);

  function insertMention(userId: string, name: string) {
    setComment((prev) => prev.replace(/(^|\s)@[^\s@]*$/, `$1@${name.split(/\s+/)[0]} `));
    setMentionUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    setMentionOpen(false);
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]">
        {!task ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b px-6 py-4">
              <div className="flex items-start gap-2">
                <Input
                  value={draft.title ?? task.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  onBlur={() => {
                    if (draft.title && draft.title !== task.title) {
                      patchMutation.mutate({ taskId, patch: { title: draft.title.trim() } });
                    }
                  }}
                  className="h-9 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                />
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  value={task.status}
                  onValueChange={(v) =>
                    patchMutation.mutate({
                      taskId,
                      patch: { status: v as TaskStatus, done: v === "done" },
                    })
                  }
                >
                  <SelectTrigger className={cn("h-7 w-[140px] text-xs", STATUS_META[task.status].badge)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={task.priority}
                  onValueChange={(v) =>
                    patchMutation.mutate({ taskId, patch: { priority: v as TaskPriority } })
                  }
                >
                  <SelectTrigger className={cn("h-7 w-[120px] text-xs", PRIORITY_META[task.priority].badge)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AssigneePicker
                  brandId={brandId}
                  value={task.assignee_id}
                  onChange={(id) => patchMutation.mutate({ taskId, patch: { assignee_id: id } })}
                  compact
                />
                <Input
                  type="datetime-local"
                  className="h-7 w-[190px] text-xs"
                  value={task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : ""}
                  onChange={(e) =>
                    patchMutation.mutate({
                      taskId,
                      patch: { due_at: e.target.value ? new Date(e.target.value).toISOString() : null },
                    })
                  }
                />
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Descrição</label>
                <Textarea
                  rows={4}
                  placeholder="Adicione contexto, checklist e links..."
                  value={draft.description ?? task.description ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  onBlur={() => {
                    const val = (draft.description ?? "").trim();
                    if ((task.description ?? "") !== val) {
                      patchMutation.mutate({ taskId, patch: { description: val || null } });
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Conta</label>
                  <ClientPicker
                    brandId={brandId}
                    value={task.client_id}
                    onChange={(id) =>
                      patchMutation.mutate({ taskId, patch: { client_id: id, project_id: null } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Projeto</label>
                  <ProjectPicker
                    brandId={brandId}
                    clientId={task.client_id}
                    value={task.project_id}
                    onChange={(id) => patchMutation.mutate({ taskId, patch: { project_id: id } })}
                  />
                </div>
              </div>

              <Separator />

              {/* Comments */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Discussão</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {commentsQ.data?.length ?? 0}
                  </Badge>
                </div>
                {commentsQ.isLoading ? (
                  <div className="text-xs text-muted-foreground">Carregando comentários...</div>
                ) : (commentsQ.data ?? []).length === 0 ? (
                  <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Sem comentários. Use @ para mencionar alguém do time.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {(commentsQ.data ?? []).map((c) => (
                      <li key={c.id} className="flex gap-3">
                        <Avatar className="h-7 w-7">
                          {c.author_avatar ? <AvatarImage src={c.author_avatar} /> : null}
                          <AvatarFallback className="text-[10px]">{initials(c.author_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 rounded-md border bg-muted/30 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{c.author_name ?? "Alguém"}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(c.created_at), "d 'de' MMM · HH:mm", { locale: ptBR })}
                              {c.author_id === currentUserId ? (
                                <button
                                  className="ml-2 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeComment.mutate(c.id)}
                                  aria-label="Excluir comentário"
                                >
                                  <Trash2 className="inline h-3 w-3" />
                                </button>
                              ) : null}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{renderMentions(c.body)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Composer */}
                <div className="relative">
                  <Textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && comment.trim()) {
                        e.preventDefault();
                        send.mutate();
                      }
                    }}
                    placeholder="Escreva um comentário. Use @ para mencionar. Cmd/Ctrl+Enter para enviar."
                    className="pr-24"
                  />
                  <Button
                    size="sm"
                    className="absolute bottom-2 right-2"
                    onClick={() => send.mutate()}
                    disabled={!comment.trim() || send.isPending}
                  >
                    {send.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-3.5 w-3.5" />
                    )}
                    Enviar
                  </Button>

                  {mentionOpen ? (
                    <div className="absolute bottom-14 left-0 z-20 w-64 rounded-md border bg-popover shadow-md">
                      <MentionList
                        members={members}
                        query={mentionQuery}
                        onPick={(u) => insertMention(u.id, u.name)}
                      />
                    </div>
                  ) : null}
                </div>

                {mentionUserIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {mentionUserIds.map((id) => {
                      const u = members.find((m) => m.id === id);
                      if (!u) return null;
                      return (
                        <Badge key={id} variant="secondary" className="gap-1">
                          @{u.name}
                          <button
                            onClick={() =>
                              setMentionUserIds((prev) => prev.filter((x) => x !== id))
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t bg-background px-6 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("Excluir esta tarefa?")) removeTask.mutate();
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
              </Button>
              <div className="text-[11px] text-muted-foreground">
                Criada em {format(new Date(task.created_at), "d 'de' MMM yyyy", { locale: ptBR })}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function renderMentions(text: string) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function MentionList({
  members,
  query,
  onPick,
}: {
  members: Array<{ id: string; name: string; avatar_url: string | null }>;
  query: string;
  onPick: (u: { id: string; name: string }) => void;
}) {
  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (filtered.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">Nenhum membro</p>;
  }
  return (
    <ul className="max-h-56 overflow-y-auto py-1">
      {filtered.slice(0, 8).map((m) => (
        <li key={m.id}>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => onPick(m)}
          >
            <Avatar className="h-5 w-5">
              {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
              <AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback>
            </Avatar>
            {m.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------- Pickers ----------

function AssigneePicker({
  brandId,
  value,
  onChange,
  compact = false,
}: {
  brandId: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  compact?: boolean;
}) {
  const listMembers = useServerFn(listBrandAssigneesFn);
  const { data } = useQuery({
    queryKey: ["brand-assignees", brandId],
    queryFn: () => listMembers({ data: { brandId } }),
    staleTime: 60_000,
  });
  const members = data ?? [];
  const selected = members.find((m) => m.id === value);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("justify-start gap-2", compact ? "h-7 text-xs" : "w-full")}
        >
          {selected ? (
            <>
              <Avatar className="h-5 w-5">
                {selected.avatar_url ? <AvatarImage src={selected.avatar_url} /> : null}
                <AvatarFallback className="text-[9px]">{initials(selected.name)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <>
              <UserIcon className="h-3.5 w-3.5" />
              <span>Sem responsável</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar membro..." />
          <CommandList>
            <CommandEmpty>Nenhum membro</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <UserIcon className="mr-2 h-4 w-4" /> Sem responsável
              </CommandItem>
              {members.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <Avatar className="mr-2 h-5 w-5">
                    {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
                    <AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ClientPicker({
  brandId,
  value,
  onChange,
}: {
  brandId: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
}) {
  const list = useServerFn(listClients);
  const { data } = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId } }),
    staleTime: 60_000,
  });
  const items = data ?? [];
  return (
    <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Nenhuma" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Nenhuma</SelectItem>
        {items.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProjectPicker({
  brandId,
  clientId,
  value,
  onChange,
}: {
  brandId: string;
  clientId: string | null | undefined;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
}) {
  const list = useServerFn(listProjectsFn);
  const { data } = useQuery({
    queryKey: ["projects", brandId],
    queryFn: () => list({ data: { brandId } }),
    staleTime: 60_000,
  });
  const items = (data ?? []).filter((p) => !clientId || p.client_id === clientId || p.client_id === null);
  return (
    <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Nenhum projeto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Nenhum projeto</SelectItem>
        {items.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}