import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Search,
  Loader2,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Flame,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  MessageSquare,
  Send,
  CalendarIcon,
  User as UserIcon,
  Folder,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  addTaskCommentFn,
  createTaskFn,
  deleteTaskCommentFn,
  deleteTaskFn,
  listProjectsFn,
  listTaskCommentsFn,
  listTasksFn,
  updateTaskFn,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from "@/lib/tasks.functions";
import { listBrandAssigneesFn } from "@/lib/content.functions";
import { listClients } from "@/lib/workspace.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  DashboardPageShell,
  DashboardPanelSurface,
  DashboardCountBadge,
} from "@/components/ui/dashboard-primitives";
import { KpiCard, type KpiTone } from "@/components/ui/kpi-card";
import { PanelEmptyState } from "@/components/ui/panel-empty";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

// ---------- Style maps ----------

const STATUS_META: Record<TaskStatus, { label: string; icon: typeof Circle; badge: string; dot: string }> = {
  todo: {
    label: "A fazer",
    icon: Circle,
    badge: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  in_progress: {
    label: "Em progresso",
    icon: Clock,
    badge: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  review: {
    label: "Revisão",
    icon: AlertTriangle,
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  done: {
    label: "Concluída",
    icon: CheckCircle2,
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
};

const PRIORITY_META: Record<TaskPriority, { label: string; icon: typeof ArrowDown; badge: string }> = {
  low: {
    label: "Baixa",
    icon: ArrowDown,
    badge: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400",
  },
  medium: {
    label: "Média",
    icon: ArrowUp,
    badge: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  },
  high: {
    label: "Alta",
    icon: ArrowUp,
    badge: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  },
  urgent: {
    label: "Urgente",
    icon: Flame,
    badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
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
  if (days < 0) return { label: `${label} · atrasada`, tone: "text-red-600 dark:text-red-400" };
  if (days === 0) return { label: `${label} · hoje`, tone: "text-amber-600 dark:text-amber-400" };
  if (days <= 3) return { label, tone: "text-amber-600 dark:text-amber-400" };
  return { label, tone: "text-muted-foreground" };
}

// ---------- Page ----------

function TasksPage() {
  const { brandId, clientId } = useActiveContext();
  const qc = useQueryClient();
  const listTasks = useServerFn(listTasksFn);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "mine" | "overdue">("all");
  const [me, setMe] = useState<string | null>(null);

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
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (view === "mine" && t.assignee_id !== me) return false;
      if (view === "overdue") {
        if (!t.due_at || t.status === "done") return false;
        if (new Date(t.due_at).getTime() > Date.now()) return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.assignee_name ?? "").toLowerCase().includes(q) ||
        (t.project_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [tasks, search, view, me]);

  const kpis = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter(
      (t) => t.due_at && t.status !== "done" && new Date(t.due_at).getTime() < Date.now(),
    ).length;
    const mine = me ? tasks.filter((t) => t.assignee_id === me && t.status !== "done").length : 0;
    return { total, done, overdue, mine };
  }, [tasks, me]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, TaskRow[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of filtered) map[t.status].push(t);
    return map;
  }, [filtered]);

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

  return (
    <DashboardPageShell>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total" value={kpis.total} icon={<Circle className="h-4 w-4" />} tone="neutral" />
        <KpiCard label="Minhas abertas" value={kpis.mine} icon={<UserIcon className="h-4 w-4" />} tone="sky" />
        <KpiCard label="Atrasadas" value={kpis.overdue} icon={<AlertTriangle className="h-4 w-4" />} tone="rose" />
        <KpiCard label="Concluídas" value={kpis.done} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, responsável, projeto..."
            className="h-9 pl-9"
          />
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList className="h-9">
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="mine">Minhas</TabsTrigger>
            <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Groups */}
      {tasksQ.isLoading ? (
        <DashboardPanelSurface className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando tarefas...
        </DashboardPanelSurface>
      ) : filtered.length === 0 ? (
        <DashboardPanelSurface>
          <PanelEmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            text="Nenhuma tarefa por aqui — crie a primeira para começar a organizar o trabalho do time."
          />
          <div className="flex justify-center pb-8">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        </DashboardPanelSurface>
      ) : (
        <div className="space-y-5">
          {TASK_STATUSES.map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;
            const meta = STATUS_META[status];
            return (
              <DashboardPanelSurface key={status}>
                <header className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-4 py-2.5">
                  <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                  <h2 className="text-[11px] font-mono uppercase tracking-widest text-foreground">
                    {meta.label}
                  </h2>
                  <DashboardCountBadge className="ml-1">{list.length}</DashboardCountBadge>
                </header>
                <div className="divide-y divide-border/60">
                  {list.map((task) => (
                    <TaskRowItem
                      key={task.id}
                      task={task}
                      onOpen={() => setOpenTaskId(task.id)}
                      onQuickChange={() => qc.invalidateQueries({ queryKey: invalidateKey })}
                    />
                  ))}
                </div>
              </DashboardPanelSurface>
            );
          })}
        </div>
      )}

      {createOpen ? (
        <CreateTaskDialog
          brandId={brandId}
          clientId={clientId ?? null}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            qc.invalidateQueries({ queryKey: invalidateKey });
            setOpenTaskId(id);
          }}
        />
      ) : null}

      {openTaskId ? (
        <TaskDetailSheet
          taskId={openTaskId}
          brandId={brandId}
          currentUserId={me}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: invalidateKey })}
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