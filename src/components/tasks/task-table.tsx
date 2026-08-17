import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Trash2,
  MessageSquare,
  Paperclip,
  CalendarIcon,
  Folder,
  Users,
  Timer,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteTaskFn,
  updateTaskFn,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from "@/lib/tasks.functions";
import {
  PRIORITY_META,
  STATUS_META,
  TaskAssignee,
  initials,
  isOverdue,
  relativeDue,
} from "./shared";

export type GroupBy = "none" | "status" | "priority" | "project" | "client" | "assignee";
export type SortKey =
  | "title"
  | "assignee"
  | "project"
  | "client"
  | "priority"
  | "status"
  | "due"
  | "created"
  | "time";
export type SortDir = "asc" | "desc";

export type VisibleColumns = {
  assignee: boolean;
  project: boolean;
  client: boolean;
  priority: boolean;
  status: boolean;
  due: boolean;
  created: boolean;
  time: boolean;
  comments: boolean;
  attachments: boolean;
};

export const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  assignee: true,
  project: true,
  client: true,
  priority: true,
  status: true,
  due: true,
  created: false,
  time: true,
  comments: true,
  attachments: false,
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, review: 2, done: 3 };

function compare(a: TaskRow, b: TaskRow, key: SortKey): number {
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title);
    case "assignee":
      return (a.assignee_name ?? "").localeCompare(b.assignee_name ?? "");
    case "project":
      return (a.project_name ?? "").localeCompare(b.project_name ?? "");
    case "client":
      return (a.client_name ?? "").localeCompare(b.client_name ?? "");
    case "priority":
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "due":
      return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
    case "created":
      return b.created_at.localeCompare(a.created_at);
    case "time":
      return (a.time_spent_seconds ?? 0) - (b.time_spent_seconds ?? 0);
  }
}

function groupTasks(tasks: TaskRow[], groupBy: GroupBy): Array<{ key: string; label: string; items: TaskRow[] }> {
  if (groupBy === "none") return [{ key: "all", label: "Todas as tarefas", items: tasks }];
  const map = new Map<string, { label: string; items: TaskRow[] }>();
  for (const t of tasks) {
    let key: string;
    let label: string;
    switch (groupBy) {
      case "status":
        key = t.status;
        label = STATUS_META[t.status].label;
        break;
      case "priority":
        key = t.priority;
        label = PRIORITY_META[t.priority].label;
        break;
      case "project":
        key = t.project_id ?? "__none__";
        label = t.project_name ?? "Sem projeto";
        break;
      case "client":
        key = t.client_id ?? "__none__";
        label = t.client_name ?? "Sem cliente";
        break;
      case "assignee":
        key = t.assignee_id ?? "__none__";
        label = t.assignee_name ?? "Sem responsável";
        break;
    }
    const bucket = map.get(key) ?? { label, items: [] };
    bucket.items.push(t);
    map.set(key, bucket);
  }
  // Deterministic order for known groupings
  const ordered = Array.from(map.entries());
  if (groupBy === "status") {
    ordered.sort(([a], [b]) => STATUS_ORDER[a as TaskStatus] - STATUS_ORDER[b as TaskStatus]);
  } else if (groupBy === "priority") {
    ordered.sort(([a], [b]) => PRIORITY_ORDER[a as TaskPriority] - PRIORITY_ORDER[b as TaskPriority]);
  } else {
    ordered.sort(([, a], [, b]) => a.label.localeCompare(b.label));
  }
  return ordered.map(([key, v]) => ({ key, label: v.label, items: v.items }));
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  if (dir === "asc") return <ArrowUp className="h-3 w-3" />;
  if (dir === "desc") return <ArrowDown className="h-3 w-3" />;
  return <ArrowUpDown className="h-3 w-3 opacity-40" />;
}

function Th({
  children,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
  align = "left",
}: {
  children?: React.ReactNode;
  sortKey?: SortKey;
  currentKey?: SortKey;
  currentDir?: SortDir;
  onSort?: (k: SortKey) => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const isCurrent = sortKey && sortKey === currentKey;
  return (
    <th
      className={cn(
        "sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
    >
      {sortKey && onSort ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => onSort(sortKey)}
        >
          {children}
          <SortIcon dir={isCurrent ? currentDir ?? "asc" : null} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TaskTable({
  brandId,
  tasks,
  columns,
  groupBy,
  sortKey,
  sortDir,
  onSort,
  selectedIds,
  onSelectionChange,
  onOpenTask,
  onChanged,
}: {
  brandId: string;
  tasks: TaskRow[];
  columns: VisibleColumns;
  groupBy: GroupBy;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
}) {
  const sorted = useMemo(() => {
    const list = [...tasks];
    list.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return list;
  }, [tasks, sortKey, sortDir]);

  const groups = useMemo(() => groupTasks(sorted, groupBy), [sorted, groupBy]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggle(key: string) {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  const someSelected = !allSelected && tasks.some((t) => selectedIds.has(t.id));

  function toggleAll(checked: boolean) {
    if (checked) onSelectionChange(new Set(tasks.map((t) => t.id)));
    else onSelectionChange(new Set());
  }
  function toggleOne(id: string) {
    const n = new Set(selectedIds);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onSelectionChange(n);
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr>
              <Th align="center" className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                  aria-label="Selecionar todas"
                />
              </Th>
              <Th sortKey="title" currentKey={sortKey} currentDir={sortDir} onSort={onSort}>
                Nome da tarefa
              </Th>
              {columns.assignee && (
                <Th sortKey="assignee" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[140px]">
                  Responsável
                </Th>
              )}
              {columns.project && (
                <Th sortKey="project" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[140px]">
                  Projeto
                </Th>
              )}
              {columns.client && (
                <Th sortKey="client" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[140px]">
                  Cliente
                </Th>
              )}
              {columns.priority && (
                <Th sortKey="priority" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[110px]">
                  Prioridade
                </Th>
              )}
              {columns.status && (
                <Th sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[140px]">
                  Status
                </Th>
              )}
              {columns.due && (
                <Th sortKey="due" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[140px]">
                  Prazo
                </Th>
              )}
              {columns.created && (
                <Th sortKey="created" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[120px]">
                  Criado em
                </Th>
              )}
              {columns.time && (
                <Th sortKey="time" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="w-[110px]">
                  Tempo
                </Th>
              )}
              {columns.comments && <Th className="w-16" align="center">Coment.</Th>}
              {columns.attachments && <Th className="w-16" align="center">Anexos</Th>}
              <Th className="w-10" align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <TaskGroup
                key={group.key}
                group={group}
                collapsed={collapsed.has(group.key)}
                toggle={() => toggle(group.key)}
                brandId={brandId}
                columns={columns}
                selectedIds={selectedIds}
                toggleOne={toggleOne}
                onOpenTask={onOpenTask}
                onChanged={onChanged}
                showHeader={groupBy !== "none"}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskGroup({
  group,
  collapsed,
  toggle,
  brandId,
  columns,
  selectedIds,
  toggleOne,
  onOpenTask,
  onChanged,
  showHeader,
}: {
  group: { key: string; label: string; items: TaskRow[] };
  collapsed: boolean;
  toggle: () => void;
  brandId: string;
  columns: VisibleColumns;
  selectedIds: Set<string>;
  toggleOne: (id: string) => void;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
  showHeader: boolean;
}) {
  const visibleColumnCount = 3 + Object.values(columns).filter(Boolean).length; // +checkbox +title +actions
  return (
    <>
      {showHeader && (
        <tr className="bg-muted/30">
          <td colSpan={visibleColumnCount} className="border-b border-border/60 px-3 py-2">
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-foreground hover:text-foreground/80"
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {group.label}
              <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                {group.items.length}
              </span>
            </button>
          </td>
        </tr>
      )}
      {!collapsed &&
        group.items.map((task) => (
          <TaskTableRow
            key={task.id}
            task={task}
            brandId={brandId}
            columns={columns}
            selected={selectedIds.has(task.id)}
            onToggleSelect={() => toggleOne(task.id)}
            onOpen={() => onOpenTask(task.id)}
            onChanged={onChanged}
          />
        ))}
    </>
  );
}

function TaskTableRow({
  task,
  brandId,
  columns,
  selected,
  onToggleSelect,
  onOpen,
  onChanged,
}: {
  task: TaskRow;
  brandId: string;
  columns: VisibleColumns;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const update = useServerFn(updateTaskFn);
  const remove = useServerFn(deleteTaskFn);
  const priorityMeta = PRIORITY_META[task.priority];
  const statusMeta = STATUS_META[task.status];
  const due = relativeDue(task.due_at);
  const overdue = isOverdue(task);

  const patch = useMutation({
    mutationFn: (p: Record<string, unknown>) => update({ data: { taskId: task.id, patch: p as never } }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => remove({ data: { taskId: task.id } }),
    onSuccess: () => {
      toast.success("Tarefa excluída");
      onChanged();
    },
  });

  const isDone = task.status === "done";

  return (
    <tr
      onClick={onOpen}
      className={cn(
        "group cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30",
        selected && "bg-primary/5",
      )}
    >
      <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Selecionar ${task.title}`} />
          <button
            aria-label="Marcar como concluída"
            onClick={() => patch.mutate({ done: !isDone })}
            className="shrink-0"
          >
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            )}
          </button>
        </div>
      </td>

      <td className="px-3 py-2 align-middle">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <span
            className={cn(
              "truncate text-sm font-medium",
              isDone && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
          {task.subtasks_total ? (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[9px]" title="Subtarefas concluídas">
              <ListChecks className="h-3 w-3" />
              {task.subtasks_done ?? 0}/{task.subtasks_total}
            </Badge>
          ) : null}
          {task.archived_at ? (
            <Badge variant="outline" className="shrink-0 text-[9px]">
              Arquivada
            </Badge>
          ) : null}
          {overdue && (
            <Badge
              variant="outline"
              className="shrink-0 border-rose-500/30 bg-rose-500/10 text-[9px] text-rose-700 dark:text-rose-300"
            >
              Atrasada
            </Badge>
          )}
        </div>
      </td>

      {columns.assignee && (
        <td className="px-3 py-2 align-middle">
          {task.assignee_id ? (
            <div className="flex items-center gap-2 text-xs">
              <TaskAssignee name={task.assignee_name} avatarUrl={task.assignee_avatar} size={22} />
              <span className="truncate">{task.assignee_name ?? "—"}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {columns.project && (
        <td className="px-3 py-2 align-middle">
          {task.project_name ? (
            <span className="inline-flex max-w-[130px] items-center gap-1 truncate text-xs text-muted-foreground">
              <Folder className="h-3 w-3 shrink-0" /> {task.project_name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {columns.client && (
        <td className="px-3 py-2 align-middle">
          {task.client_name ? (
            <span className="inline-flex max-w-[130px] items-center gap-1 truncate text-xs text-muted-foreground">
              <Users className="h-3 w-3 shrink-0" /> {task.client_name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {columns.priority && (
        <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
          <Select value={task.priority} onValueChange={(v) => patch.mutate({ priority: v as TaskPriority })}>
            <SelectTrigger className={cn("h-7 w-full text-[11px]", priorityMeta.badge)}>
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
        </td>
      )}

      {columns.status && (
        <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
          <Select
            value={task.status}
            onValueChange={(v) => patch.mutate({ status: v as TaskStatus, done: v === "done" })}
          >
            <SelectTrigger className={cn("h-7 w-full text-[11px]", statusMeta.badge)}>
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
        </td>
      )}

      {columns.due && (
        <td className="px-3 py-2 align-middle">
          {due ? (
            <span className={cn("inline-flex items-center gap-1 text-xs", due.tone)}>
              <CalendarIcon className="h-3 w-3" /> {due.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {columns.created && (
        <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
          {format(new Date(task.created_at), "d/MM/yyyy", { locale: ptBR })}
        </td>
      )}

      {columns.time && (
        <td className="px-3 py-2 align-middle">
          {task.time_spent_seconds && task.time_spent_seconds > 0 ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <Timer className="h-3 w-3" /> {formatDuration(task.time_spent_seconds)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {columns.comments && (
        <td className="px-3 py-2 align-middle text-center">
          {task.comments_count && task.comments_count > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" /> {task.comments_count}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {columns.attachments && (
        <td className="px-3 py-2 align-middle text-center">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" /> 0
          </span>
        </td>
      )}

      <td className="px-3 py-2 align-middle text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
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
      </td>
    </tr>
  );
}