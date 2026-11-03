import { useState } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { updateProject } from "@/lib/projects.functions";
import { groupProjectsByStatus, statusIdFromDropTarget } from "@/lib/projects-kanban";
import { cn } from "@/lib/utils";
import { StatusDot, useWorkStatuses } from "./status-picker";

export type KanbanProject = {
  id: string;
  name: string;
  status_id: string | null;
  client_id: string | null;
  due_at: string | null;
};

function Card({ project, clientName, dueLabel, onOpen, overlay, statuses, onMove }: { project: KanbanProject; clientName: string | null; dueLabel: string | null; onOpen: () => void; overlay?: boolean; statuses?: Array<{ id: string; name: string }>; onMove?: (statusId: string | null) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id, disabled: overlay });
  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={onOpen}
      className={cn("cursor-grab rounded-md border border-border/60 bg-background p-3 shadow-sm transition-shadow hover:shadow-md", isDragging && "opacity-40")}
    >
      <p className="line-clamp-2 text-sm font-semibold">{project.name}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{clientName ?? "Sem cliente"}</span>
        {dueLabel ? <span className="shrink-0 tabular-nums">{dueLabel}</span> : null}
      </div>
      {statuses && onMove && !overlay ? (
        <select
          aria-label={`Mudar status de ${project.name}`}
          value={project.status_id ?? ""}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onMove(e.target.value || null)}
          className="mt-2 h-7 w-full rounded-md border border-border/60 bg-background px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <option value="">Status: Sem status</option>
          {statuses.map((st) => (
            <option key={st.id} value={st.id}>Status: {st.name}</option>
          ))}
        </select>
      ) : null}
    </article>
  );
}

function Column({ id, name, color, count, children }: { id: string; name: string; color: string | null; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `project-status:${id}` });
  return (
    <section className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-md border border-border/60 bg-muted/20">
      <header className="flex items-center gap-2 border-b border-border/60 bg-background/70 px-3 py-3">
        <StatusDot color={color} round />
        <h3 className="truncate text-[11px] font-semibold uppercase">{name}</h3>
        <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">{count}</Badge>
      </header>
      <div ref={setNodeRef} className={cn("flex min-h-56 flex-1 flex-col gap-2 p-2", isOver && "bg-primary/5")}>
        {children}
        {count === 0 ? <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border/60 p-5 text-[11px] text-muted-foreground">Nenhum projeto</div> : null}
      </div>
    </section>
  );
}

/** Projetos em colunas pelos status de projeto do workspace; arrastar muda só o status do projeto. */
export function ProjectsKanban({
  brandId,
  projects,
  clientName,
  dueLabel,
  onOpen,
}: {
  brandId: string;
  projects: KanbanProject[];
  clientName: (clientId: string | null) => string | null;
  dueLabel: (p: KanbanProject) => string | null;
  onOpen: (projectId: string) => void;
}) {
  const qc = useQueryClient();
  const statusesQ = useWorkStatuses(brandId, "project");
  const update = useServerFn(updateProject);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const move = useMutation({
    mutationFn: (v: { projectId: string; statusId: string | null }) =>
      update({ data: { brandId, projectId: v.projectId, patch: { status_id: v.statusId } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", brandId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const statuses = statusesQ.data ?? [];
  const columns = groupProjectsByStatus(projects, statuses);
  const onDragEnd = (event: DragEndEvent) => {
    setDraggedId(null);
    const project = projects.find((p) => p.id === String(event.active.id));
    const target = statusIdFromDropTarget(event.over?.id);
    if (!project || target === undefined || project.status_id === target) return;
    move.mutate({ projectId: project.id, statusId: target });
  };
  const dragged = draggedId ? projects.find((p) => p.id === draggedId) : null;
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDraggedId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDraggedId(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <Column key={col.key} id={col.key} name={col.name} color={col.color} count={col.projects.length}>
            {col.projects.map((p) => (
              <Card key={p.id} project={p} clientName={clientName(p.client_id)} dueLabel={dueLabel(p)} onOpen={() => onOpen(p.id)} statuses={statuses} onMove={(statusId) => { if (statusId !== p.status_id) move.mutate({ projectId: p.id, statusId }); }} />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay>{dragged ? <Card overlay project={dragged} clientName={clientName(dragged.client_id)} dueLabel={dueLabel(dragged)} onOpen={() => undefined} /> : null}</DragOverlay>
    </DndContext>
  );
}
