import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MoreHorizontal, Plus, MessageCircle, Calendar as CalIcon } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createCrmDealFn,
  deleteCrmDealFn,
  formatBRL,
  moveCrmDealFn,
  stageDotClass,
  type CrmBoard,
  type CrmDeal,
  type CrmStage,
} from "@/lib/crm.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Props = {
  board: CrmBoard;
  brandId: string;
  clientId: string;
};

export function CrmBoard({ board, brandId, clientId }: Props) {
  const qc = useQueryClient();
  const boardKey = ["crm-board", board.pipeline.id];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeDeal, setActiveDeal] = useState<CrmDeal | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);

  const dealsByStage = useMemo(() => {
    const map = new Map<string, CrmDeal[]>();
    board.stages.forEach((s) => map.set(s.id, []));
    [...board.deals]
      .sort((a, b) => a.position - b.position)
      .forEach((d) => {
        const bucket = map.get(d.stage_id);
        if (bucket) bucket.push(d);
      });
    return map;
  }, [board]);

  const moveFn = useServerFn(moveCrmDealFn);
  const move = useMutation({
    mutationFn: (v: { dealId: string; toStageId: string; position: number }) => moveFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createFn = useServerFn(createCrmDealFn);
  const create = useMutation({
    mutationFn: (v: { stageId: string; contactName: string }) =>
      createFn({
        data: {
          pipelineId: board.pipeline.id,
          brandId,
          clientId,
          stageId: v.stageId,
          contactName: v.contactName,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKey });
      setCreatingIn(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delFn = useServerFn(deleteCrmDealFn);
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { dealId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    const d = board.deals.find((x) => x.id === id) ?? null;
    setActiveDeal(d);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDeal(null);
    if (!e.over) return;
    const dealId = String(e.active.id);
    const overId = String(e.over.id);
    const targetStageId = overId.startsWith("stage:") ? overId.slice(6) : board.deals.find((d) => d.id === overId)?.stage_id;
    if (!targetStageId) return;
    const deal = board.deals.find((d) => d.id === dealId);
    if (!deal) return;
    const currentBucket = dealsByStage.get(targetStageId) ?? [];
    const nextPos = currentBucket.length;
    if (deal.stage_id === targetStageId && nextPos === deal.position + 1) return;
    move.mutate({ dealId, toStageId: targetStageId, position: nextPos });
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDeal(null)}>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden p-[5px] pb-3">
        {board.stages.map((stage) => {
          const deals = dealsByStage.get(stage.id) ?? [];
          const total = deals.reduce((acc, d) => acc + d.amount_cents, 0);
          return (
            <Lane
              key={stage.id}
              stage={stage}
              deals={deals}
              total={total}
              creating={creatingIn === stage.id}
              onStartCreate={() => setCreatingIn(stage.id)}
              onCancelCreate={() => setCreatingIn(null)}
              onConfirmCreate={(name) => create.mutate({ stageId: stage.id, contactName: name })}
              creatingBusy={create.isPending}
              onDelete={(id) => del.mutate(id)}
            />
          );
        })}
      </div>
      <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function Lane({
  stage,
  deals,
  total,
  creating,
  onStartCreate,
  onCancelCreate,
  onConfirmCreate,
  creatingBusy,
  onDelete,
}: {
  stage: CrmStage;
  deals: CrmDeal[];
  total: number;
  creating: boolean;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onConfirmCreate: (name: string) => void;
  creatingBusy: boolean;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const [name, setName] = useState("");

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full w-[300px] shrink-0 flex-col rounded-xl border border-border/60 bg-muted/30 transition ${
        isOver ? "border-border bg-muted/50" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stageDotClass(stage.color)}`} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{stage.label}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{formatBRL(total)}</span>
              <span className="opacity-60">·</span>
              <span>{deals.length === 0 ? "Sem negócios" : `${deals.length} ${deals.length === 1 ? "negócio" : "negócios"}`}</span>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100"
              aria-label="Opções do estágio"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled>Renomear</DropdownMenuItem>
            <DropdownMenuItem disabled>Mudar cor</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-destructive">Excluir estágio</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mx-4 border-t border-border/60" />

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {deals.length === 0 && !creating ? (
          <div className="mt-2 rounded-lg border border-dashed border-border/50 py-6 text-center text-xs text-muted-foreground">
            Arraste ou crie um negócio
          </div>
        ) : null}
        {deals.map((d) => (
          <DraggableDealCard key={d.id} deal={d} onDelete={() => onDelete(d.id)} />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 p-2">
        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = name.trim();
              if (!v) return;
              onConfirmCreate(v);
              setName("");
            }}
            className="space-y-2 p-1"
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do contato"
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" type="submit" disabled={creatingBusy || !name.trim()} className="h-7 flex-1">
                Adicionar
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  setName("");
                  onCancelCreate();
                }}
                className="h-7"
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={onStartCreate}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Novo negócio
          </button>
        )}
      </div>
    </div>
  );
}

function DraggableDealCard({ deal, onDelete }: { deal: CrmDeal; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${isDragging ? "opacity-40" : ""} touch-none`}
    >
      <DealCard deal={deal} onDelete={onDelete} />
    </div>
  );
}

function DealCard({ deal, dragging, onDelete }: { deal: CrmDeal; dragging?: boolean; onDelete?: () => void }) {
  const initials = deal.contact_initials || deal.contact_name.slice(0, 2).toUpperCase();
  const created = new Date(deal.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return (
    <div
      className={`group rounded-lg border border-border/70 bg-background/70 p-3 shadow-sm transition hover:border-border hover:bg-background ${
        dragging ? "rotate-1 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-foreground/80">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-sm font-medium text-foreground">{deal.contact_name}</div>
            {onDelete ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    aria-label="Opções do negócio"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          {deal.service ? (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{deal.service}</div>
          ) : null}
          {deal.owner_name ? (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{deal.owner_name}</div>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="tabular-nums font-medium text-foreground/80">{formatBRL(deal.amount_cents)}</span>
            <div className="flex items-center gap-2">
              {deal.whatsapp ? <MessageCircle className="h-3 w-3 text-emerald-500" /> : null}
              <span className="inline-flex items-center gap-1">
                <CalIcon className="h-3 w-3" /> {created}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}