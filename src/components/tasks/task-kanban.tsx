import { useMemo, useState } from "react";
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
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarIcon, Folder, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { updateTaskFn, type TaskRow, type TaskStatus } from "@/lib/tasks.functions";
import {
  KANBAN_COLUMNS,
  PRIORITY_META,
  STATUS_META,
  TaskAssignee,
  isOverdue,
  relativeDue,
} from "./shared";

function KanbanCard({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const priority = PRIORITY_META[task.priority];
  const due = relativeDue(task.due_at);
  const overdue = isOverdue(task);
  const total = task.subtasks_total ?? 0;
  const doneCount = task.subtasks_done ?? 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={onOpen}
      className={cn(
        "cursor-grab rounded-lg border border-border/60 bg-card p-2.5 shadow-sm transition hover:border-foreground/20",
        isDragging && "opacity-40",
      )}
    >
      <button
        onClick={onOpen}
        className="block w-full text-left text-sm font-medium leading-snug hover:underline"
      >
        {task.title}
      </button>

      {task.project_name && (
        <div className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-muted-foreground">
          <Folder className="h-3 w-3 shrink-0" /> {task.project_name}
        </div>
      )}

      {total > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-emerald-500"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <ListChecks className="h-3 w-3" /> {doneCount}/{total}
          </span>
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          {overdue ? (
            <span className="font-medium text-rose-600 dark:text-rose-400">Atrasada</span>
          ) : due ? (
            <span className={cn("inline-flex items-center gap-1", due.tone)}>
              <CalendarIcon className="h-3 w-3" /> {due.label}
            </span>
          ) : (
            <span className="text-muted-foreground/70">Sem prazo</span>
          )}
          {task.priority === "urgent" || task.priority === "high" ? (
            <Badge variant="outline" className={cn("text-[9px]", priority.badge)}>
              {priority.label}
            </Badge>
          ) : null}
        </div>
        {task.assignee_id ? (
          <TaskAssignee name={task.assignee_name} avatarUrl={task.assignee_avatar} size={20} />
        ) : (
          <span className="h-5 w-5 rounded-full border border-dashed border-border/60" />
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  tasks,
  onOpen,
}: {
  status: TaskStatus;
  tasks: TaskRow[];
  onOpen: (id: string) => void;
}) {
  const meta = STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div className="flex w-[300px] shrink-0 flex-col rounded-xl border border-border/60 bg-muted/20">
      <header className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-3 py-2.5">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-foreground">
          {meta.label}
        </h2>
        <span className="ml-auto rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          {tasks.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 p-2 min-h-[200px] transition-colors",
          isOver && "bg-primary/5",
        )}
      >
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} onOpen={() => onOpen(t.id)} />
        ))}
        {tasks.length === 0 && (
          <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border/60 px-3 py-8 text-center text-[11px] text-muted-foreground">
            Sem tarefas nesta coluna
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskKanban({
  tasks,
  onOpenTask,
  onChanged,
}: {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
  onChanged: () => void;
}) {
  const update = useServerFn(updateTaskFn);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, TaskRow[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const move = useMutation({
    mutationFn: (payload: { id: string; status: TaskStatus }) =>
      update({
        data: {
          taskId: payload.id,
          patch: { status: payload.status, done: payload.status === "done" },
        },
      }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = String(e.over?.id ?? "");
    if (!overId.startsWith("col:")) return;
    const nextStatus = overId.slice(4) as TaskStatus;
    const task = tasks.find((t) => t.id === e.active.id);
    if (!task || task.status === nextStatus) return;
    move.mutate({ id: task.id as string, status: nextStatus });
  }

  const activeTask = activeId ? (tasks.find((t) => t.id === activeId) ?? null) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map((status) => (
          <KanbanColumn key={status} status={status} tasks={grouped[status]} onOpen={onOpenTask} />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <KanbanCard task={activeTask} onOpen={() => {}} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
