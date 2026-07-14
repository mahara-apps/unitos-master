import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Paperclip, ImageIcon, CalendarDays, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createStageFn,
  updateStageFn,
  deleteStageFn,
  createPostFn,
  movePostFn,
  STAGE_COLORS,
  type Board,
  type BoardPost,
  type PipelineStage,
  type StageColor,
} from "@/lib/content.functions";
import { STAGE_GRADIENT, PRIORITY_STYLES, PRIORITY_LABEL } from "./stage-colors";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Settings2 } from "lucide-react";

const COLOR_MAP: Record<StageColor, string> = {
  muted: "bg-muted-foreground/60",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  cyan: "bg-cyan-500",
};

type Props = {
  board: Board;
  boardQueryKey: readonly unknown[];
  onOpenPost: (id: string) => void;
  onConfigureColumns?: () => void;
  onNewTask?: (stageId?: string) => void;
};

export function ContentBoard({ board, boardQueryKey, onOpenPost, onConfigureColumns, onNewTask }: Props) {
  const qc = useQueryClient();
  const movePost = useServerFn(movePostFn);
  const createStage = useServerFn(createStageFn);
  const updateStage = useServerFn(updateStageFn);
  const deleteStage = useServerFn(deleteStageFn);
  const createPost = useServerFn(createPostFn);

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const postsByStage = useMemo(() => {
    const m = new Map<string, BoardPost[]>();
    for (const s of board.stages) m.set(s.id, []);
    for (const p of board.posts) {
      if (!p.stage_id) continue;
      if (!m.has(p.stage_id)) m.set(p.stage_id, []);
      m.get(p.stage_id)!.push(p);
    }
    for (const list of m.values()) list.sort((a, b) => a.position - b.position);
    return m;
  }, [board]);

  const activePost = useMemo(
    () => (activeId ? board.posts.find((p) => p.id === activeId) ?? null : null),
    [activeId, board.posts],
  );

  const moveMutation = useMutation({
    mutationFn: (v: { postId: string; toStageId: string; toPosition: number }) =>
      movePost({ data: v }),
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: boardQueryKey });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardQueryKey });
    },
  });

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function handleDragOver(_e: DragOverEvent) {}
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const postId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    // Over can be a stage id or a post id — resolve to stage
    const targetStageId = board.stages.find((s) => s.id === overId)?.id
      ?? board.posts.find((p) => p.id === overId)?.stage_id
      ?? null;
    if (!targetStageId) return;

    const list = [...(postsByStage.get(targetStageId) ?? [])];
    const currentPost = board.posts.find((p) => p.id === postId);
    if (!currentPost) return;

    // Determine new position: append to bottom of target stage
    const lastPos = list.length > 0 ? list[list.length - 1].position : -1024;
    const newPos = lastPos + 1024;

    if (currentPost.stage_id === targetStageId && currentPost.position === newPos) return;

    // Optimistic update
    qc.setQueryData<Board>(boardQueryKey, (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        posts: prev.posts.map((p) =>
          p.id === postId ? { ...p, stage_id: targetStageId, position: newPos } : p,
        ),
      };
    });

    moveMutation.mutate({ postId, toStageId: targetStageId, toPosition: newPos });
  }

  const addStage = useMutation({
    mutationFn: () => createStage({ data: { pipelineId: board.pipeline.id, label: "Nova coluna", color: "muted" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardQueryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [creatingIn, setCreatingIn] = useState<string | null>(null);

  const addPost = useMutation({
    mutationFn: (v: { stageId: string; title: string }) =>
      createPost({
        data: {
          brandId: board.pipeline.brand_id,
          clientId: board.pipeline.client_id,
          pipelineId: board.pipeline.id,
          stageId: v.stageId,
          title: v.title,
        },
      }),
    onSuccess: () => {
      setCreatingIn(null);
      qc.invalidateQueries({ queryKey: boardQueryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex min-h-0 flex-1 gap-5 overflow-x-auto overflow-y-hidden p-[5px]">
        {board.stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            posts={postsByStage.get(stage.id) ?? []}
            onOpenPost={onOpenPost}
            onRename={(label) => updateStage({ data: { stageId: stage.id, patch: { label } } })
              .then(() => qc.invalidateQueries({ queryKey: boardQueryKey }))}
            onRecolor={(color) => updateStage({ data: { stageId: stage.id, patch: { color } } })
              .then(() => qc.invalidateQueries({ queryKey: boardQueryKey }))}
            onDelete={() => deleteStage({ data: { stageId: stage.id } })
              .then(() => qc.invalidateQueries({ queryKey: boardQueryKey }))
              .catch((e: Error) => toast.error(e.message))}
            creating={creatingIn === stage.id}
            onStartCreate={() => setCreatingIn(stage.id)}
            onCancelCreate={() => setCreatingIn(null)}
            onConfirmCreate={(title) => addPost.mutate({ stageId: stage.id, title })}
            adding={addPost.isPending}
            onOpenRichCreate={onNewTask ? () => onNewTask(stage.id) : undefined}
            onConfigure={onConfigureColumns}
          />
        ))}
        <button
          type="button"
          className="flex h-full min-w-[300px] shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-transparent px-3 py-3 text-sm text-muted-foreground transition hover:border-border hover:bg-muted/40"
          onClick={() => addStage.mutate()}
          disabled={addStage.isPending}
        >
          <Plus className="h-4 w-4" /> Adicionar coluna
        </button>
      </div>
      <DragOverlay>
        {activePost ? (
          <div className="w-64 rotate-2">
            <PostCard post={activePost} onOpen={() => {}} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  posts,
  onOpenPost,
  onRename,
  onRecolor,
  onDelete,
  creating,
  onStartCreate,
  onCancelCreate,
  onConfirmCreate,
  adding,
  onOpenRichCreate,
  onConfigure,
}: {
  stage: PipelineStage;
  posts: BoardPost[];
  onOpenPost: (id: string) => void;
  onRename: (label: string) => void;
  onRecolor: (color: StageColor) => void;
  onDelete: () => void;
  creating: boolean;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onConfirmCreate: (title: string) => void;
  adding: boolean;
  onOpenRichCreate?: () => void;
  onConfigure?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(stage.label);
  const [newTitle, setNewTitle] = useState("");

  return (
    <div
      ref={setNodeRef}
      className={`relative flex h-full w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/30 p-4 pt-[18px] transition ${
        isOver ? "border-primary/60 bg-primary/5" : "border-border/60"
      }`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${STAGE_GRADIENT[stage.color] ?? STAGE_GRADIENT.muted}`} />
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_MAP[stage.color] ?? COLOR_MAP.muted}`}
                aria-label="Alterar cor"
              />
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2">
              <div className="grid grid-cols-4 gap-1">
                {STAGE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onRecolor(c)}
                    className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition ${COLOR_MAP[c]} ${
                      stage.color === c ? "ring-2 ring-foreground" : ""
                    }`}
                    aria-label={c}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {editing ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-7 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRename(label.trim() || stage.label);
                    setEditing(false);
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  onRename(label.trim() || stage.label);
                  setEditing(false);
                }}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="truncate text-sm font-medium tracking-tight hover:underline"
              onClick={() => setEditing(true)}
            >
              {stage.label}
            </button>
          )}
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-xs font-normal">
            {posts.length}
          </Badge>
          {stage.sla_days ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex h-5 items-center gap-0.5 rounded-md border border-border/60 px-1.5 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" /> {stage.sla_days}d
                  </span>
                </TooltipTrigger>
                <TooltipContent>SLA: {stage.sla_days} dias</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenRichCreate ?? onStartCreate}>
              <Plus className="mr-2 h-4 w-4" /> Novo post
            </DropdownMenuItem>
            {onConfigure ? (
              <DropdownMenuItem onSelect={onConfigure}>
                <Settings2 className="mr-2 h-4 w-4" /> Configurar colunas
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                if (confirm(`Excluir "${stage.label}"?`)) onDelete();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Excluir coluna
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto -mx-1 px-1">
        {posts.map((p) => (
          <DraggablePostCard key={p.id} post={p} onOpen={onOpenPost} />
        ))}

        {creating ? (
          <div className="rounded-lg border border-border/70 bg-card p-2">
            <Input
              autoFocus
              placeholder="Título do post"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) {
                  onConfirmCreate(newTitle.trim());
                  setNewTitle("");
                }
                if (e.key === "Escape") {
                  onCancelCreate();
                  setNewTitle("");
                }
              }}
            />
            <div className="mt-2 flex gap-1">
              <Button
                size="sm"
                onClick={() => {
                  if (newTitle.trim()) {
                    onConfirmCreate(newTitle.trim());
                    setNewTitle("");
                  }
                }}
                disabled={adding || !newTitle.trim()}
              >
                Adicionar
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelCreate}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {!creating ? (
        <button
          type="button"
          onClick={onOpenRichCreate ?? onStartCreate}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-2 text-xs font-medium text-muted-foreground opacity-70 transition hover:border-border/60 hover:bg-background/60 hover:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" /> Nova tarefa
        </button>
      ) : null}
    </div>
  );
}

function DraggablePostCard({ post, onOpen }: { post: BoardPost; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-none ${isDragging ? "opacity-40" : ""}`}
    >
      <PostCard post={post} onOpen={onOpen} />
    </div>
  );
}

function PostCard({
  post,
  onOpen,
  isOverlay,
}: {
  post: BoardPost;
  onOpen: (id: string) => void;
  isOverlay?: boolean;
}) {
  const priority = post.priority ?? null;
  const refCount = Array.isArray(post.reference_media) ? post.reference_media.length : 0;
  const hasCover = !!post.cover_url;
  const snippet = (post.copy ?? "")
    .replace(/^###\s+\w+\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const scheduled = post.scheduled_at ? new Date(post.scheduled_at) : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      className={`group w-full overflow-hidden rounded-xl border border-border/70 bg-card text-left shadow-[0_1px_0_0_rgba(0,0,0,0.02)] transition hover:border-primary/50 hover:shadow-md ${
        isOverlay ? "cursor-grabbing shadow-lg" : ""
      }`}
    >
      {/* Visual placeholder / cover */}
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden border-b border-dashed border-border/60 bg-gradient-to-br from-muted/60 to-muted/20">
        {hasCover ? (
          <img src={post.cover_url!} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground/70 transition group-hover:text-muted-foreground">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[10px] font-medium shadow-sm">
              <Sparkles className="h-3 w-3" /> Subir arte ou gerar com IA
            </div>
          </div>
        )}
      </div>

      <div className="p-3">
        {(priority || post.format) ? (
          <div className="mb-1 flex flex-wrap items-center gap-1">
            {post.format ? (
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {post.format}
              </span>
            ) : null}
            {priority ? (
              <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLES[priority] ?? ""}`}>
                {PRIORITY_LABEL[priority] ?? priority}
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="text-sm font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
          {post.title}
        </p>
        {snippet ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{snippet}</p>
        ) : null}

        <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            {refCount > 0 ? (
              <span className="inline-flex items-center gap-0.5" title={`${refCount} anexo(s)`}>
                <Paperclip className="h-3 w-3" /> {refCount}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 opacity-50" title="Sem anexos">
                <ImageIcon className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {scheduled ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <CalendarDays className="h-3 w-3" />
                {scheduled.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
            ) : (
              <span className="opacity-50">—</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}