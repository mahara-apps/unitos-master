import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  STAGE_COLORS,
  reorderStagesFn,
  updateStageFn,
  deleteStageFn,
  createStageFn,
  type PipelineStage,
  type StageColor,
} from "@/lib/content.functions";
import { STAGE_BG } from "./stage-colors";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { describeError } from "@/lib/errors";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pipelineId: string;
  stages: PipelineStage[];
  invalidateKey: readonly unknown[];
};

export function ColumnConfigDialog({
  open,
  onOpenChange,
  pipelineId,
  stages,
  invalidateKey,
}: Props) {
  const qc = useQueryClient();
  const reorder = useServerFn(reorderStagesFn);
  const update = useServerFn(updateStageFn);
  const remove = useServerFn(deleteStageFn);
  const create = useServerFn(createStageFn);

  const [items, setItems] = useState<PipelineStage[]>(stages);
  useEffect(() => setItems(stages), [stages, open]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const dirty = useMemo(() => {
    if (items.length !== stages.length) return true;
    return items.some((it, idx) => it.id !== stages[idx]?.id);
  }, [items, stages]);

  const save = useMutation({
    mutationFn: async () => {
      if (dirty) {
        await reorder({ data: { pipelineId, order: items.map((s) => s.id) } });
      }
    },
    onSuccess: () => {
      toast.success("Colunas salvas");
      qc.invalidateQueries({ queryKey: invalidateKey });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  async function patchStage(stageId: string, patch: Partial<PipelineStage>) {
    await update({ data: { stageId, patch: patch as never } });
    qc.invalidateQueries({ queryKey: invalidateKey });
  }

  async function deleteStage(stageId: string, label: string) {
    if (!confirm(`Excluir "${label}"?`)) return;
    try {
      await remove({ data: { stageId } });
      setItems((prev) => prev.filter((s) => s.id !== stageId));
      qc.invalidateQueries({ queryKey: invalidateKey });
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  async function addColumn() {
    try {
      const st = await create({ data: { pipelineId, label: "Nova coluna", color: "muted" } });
      setItems((prev) => [...prev, st]);
      qc.invalidateQueries({ queryKey: invalidateKey });
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setItems(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-border/60 bg-background p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-base">Configurar colunas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((stage) => (
                  <SortableRow
                    key={stage.id}
                    stage={stage}
                    onPatch={(patch) => patchStage(stage.id, patch)}
                    onDelete={() => deleteStage(stage.id, stage.label)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div>
            <Button variant="outline" size="sm" className="h-9" onClick={addColumn}>+ Adicionar coluna</Button>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <Button variant="ghost" className="h-9" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button className="h-9" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar ordem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableRow({
  stage,
  onPatch,
  onDelete,
}: {
  stage: PipelineStage;
  onPatch: (patch: Partial<PipelineStage>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });
  const [label, setLabel] = useState(stage.label);
  const [sla, setSla] = useState<string>(stage.sla_days != null ? String(stage.sla_days) : "");

  useEffect(() => setLabel(stage.label), [stage.label]);
  useEffect(() => setSla(stage.sla_days != null ? String(stage.sla_days) : ""), [stage.sla_days]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <DashboardPanelSurface
      ref={setNodeRef}
      style={style}
      className="space-y-3 p-3"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className={`h-3 w-3 rounded-full shrink-0 ${STAGE_BG[stage.color]}`} />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const v = label.trim();
            if (v && v !== stage.label) onPatch({ label: v });
          }}
          className="h-9 flex-1"
        />
        <div className="flex items-center gap-1">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPatch({ color: c as StageColor })}
              aria-label={c}
              className={`h-5 w-5 rounded-full ${STAGE_BG[c]} ${
                stage.color === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""
              }`}
            />
          ))}
        </div>
        <Button size="icon" variant="ghost" onClick={onDelete} className="h-9 w-9 text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 pl-6">
        <div className="space-y-1">
          <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">SLA (dias)</Label>
          <Input
            type="number"
            min={0}
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            onBlur={() => {
              const n = sla === "" ? null : Number(sla);
              onPatch({ sla_days: Number.isFinite(n) || n === null ? (n as number | null) : null });
            }}
            placeholder="—"
            className="h-9"
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
          <Label className="text-xs">Sumir do portal</Label>
          <Switch
            checked={!!stage.hide_in_portal}
            onCheckedChange={(v) => onPatch({ hide_in_portal: v })}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
          <Label className="text-xs">Link aprovação</Label>
          <Switch
            checked={!!stage.enables_approval_link}
            onCheckedChange={(v) => onPatch({ enables_approval_link: v })}
          />
        </div>
      </div>
    </DashboardPanelSurface>
  );
}