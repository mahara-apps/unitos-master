import { Suspense, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePageHeader } from "@/hooks/use-page-header";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  createPipelineFn,
  ensureDefaultPipelineFn,
  listPipelinesFn,
  loadBoardFn,
} from "@/lib/content.functions";
import { ContentBoard } from "@/components/content/content-board";
import { PostDetailDialog } from "@/components/content/post-detail-dialog";
import { AiCopilotSheet } from "@/components/content/ai-copilot-sheet";
import { ColumnConfigDialog } from "@/components/content/column-config-dialog";
import { NewPostDialog } from "@/components/content/new-post-dialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentPage,
});

function ContentPage() {
  const { brandId, clientId } = useActiveContext();

  if (!brandId) {
    return (
      <EmptyState
        title="Selecione um workspace"
        description="Escolha um workspace na barra lateral para visualizar o pipeline de conteúdo."
      />
    );
  }
  if (!clientId) {
    return (
      <EmptyState
        title="Selecione uma conta"
        description="O pipeline de conteúdo é organizado por cliente. Selecione uma conta ativa."
      />
    );
  }

  return <ContentReady brandId={brandId} clientId={clientId} />;
}

function ContentReady({ brandId, clientId }: { brandId: string; clientId: string }) {
  const qc = useQueryClient();
  const listPipelines = useServerFn(listPipelinesFn);
  const ensureDefault = useServerFn(ensureDefaultPipelineFn);
  const createPipeline = useServerFn(createPipelineFn);

  const pipelinesQuery = useSuspenseQuery({
    queryKey: ["content-pipelines", brandId, clientId],
    queryFn: async () => {
      const list = await listPipelines({ data: { brandId, clientId } });
      if (list.length === 0) {
        await ensureDefault({ data: { brandId, clientId } });
        return listPipelines({ data: { brandId, clientId } });
      }
      return list;
    },
  });

  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [openNewPipeline, setOpenNewPipeline] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openCopilot, setOpenCopilot] = useState(false);
  const [openColumnConfig, setOpenColumnConfig] = useState(false);
  const [newTaskStageId, setNewTaskStageId] = useState<string | null>(null);
  const [openNewTask, setOpenNewTask] = useState(false);

  const pipelines = pipelinesQuery.data;
  const effectivePipelineId = activePipelineId ?? pipelines[0]?.id ?? null;

  usePageHeader(
    {
      title: "Pipeline de conteúdo",
      subtitle: "Do briefing à publicação, com D&D fluido e colunas customizáveis.",
      actions: (
        <div className="flex items-center gap-2">
          <Select
            value={effectivePipelineId ?? undefined}
            onValueChange={(v) => setActivePipelineId(v)}
          >
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setOpenNewPipeline(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo pipeline
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenColumnConfig(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Colunas
          </Button>
          <Button size="sm" onClick={() => { setNewTaskStageId(null); setOpenNewTask(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
          </Button>
          <Button
            size="sm"
            onClick={() => setOpenCopilot(true)}
            className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white hover:opacity-95 border-0 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          >
            <Sparkles className="mr-1.5 h-4 w-4" /> Generate with AI
          </Button>
        </div>
      ),
    },
    [effectivePipelineId, pipelines.length, pipelines.map((p) => p.name).join("|")],
  );

  const createMutation = useMutation({
    mutationFn: (name: string) => createPipeline({ data: { brandId, clientId, name } }),
    onSuccess: (pipe) => {
      setActivePipelineId(pipe.id);
      setOpenNewPipeline(false);
      qc.invalidateQueries({ queryKey: ["content-pipelines", brandId, clientId] });
      toast.success("Pipeline criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-0 flex-col gap-4">
      {effectivePipelineId ? (
        <Suspense fallback={<BoardSkeleton />}>
          <BoardView
            brandId={brandId}
            clientId={clientId}
            pipelineId={effectivePipelineId}
            onOpenPost={setOpenPostId}
            onConfigureColumns={() => setOpenColumnConfig(true)}
            onNewTask={(stageId) => {
              setNewTaskStageId(stageId ?? null);
              setOpenNewTask(true);
            }}
          />
        </Suspense>
      ) : null}

      <NewPipelineDialog
        open={openNewPipeline}
        onOpenChange={setOpenNewPipeline}
        onSubmit={(name) => createMutation.mutate(name)}
        pending={createMutation.isPending}
      />

      {effectivePipelineId && openPostId ? (
        <Suspense fallback={null}>
          <PostDetailDialog
            postId={openPostId}
            onClose={() => setOpenPostId(null)}
            boardQueryKey={["content-board", brandId, clientId, effectivePipelineId] as const}
          />
        </Suspense>
      ) : null}

      <AiCopilotSheet
        open={openCopilot}
        onOpenChange={setOpenCopilot}
        brandId={brandId}
        clientId={clientId}
        pipelineId={effectivePipelineId}
        invalidateKeys={
          effectivePipelineId
            ? [["content-board", brandId, clientId, effectivePipelineId] as const,
               ["content-pipelines", brandId, clientId] as const]
            : [["content-pipelines", brandId, clientId] as const]
        }
      />

      {effectivePipelineId ? (
        <Suspense fallback={null}>
          <BoardExtras
            brandId={brandId}
            clientId={clientId}
            pipelineId={effectivePipelineId}
            openColumnConfig={openColumnConfig}
            setOpenColumnConfig={setOpenColumnConfig}
            openNewTask={openNewTask}
            setOpenNewTask={setOpenNewTask}
            newTaskStageId={newTaskStageId}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function BoardView({
  brandId,
  clientId,
  pipelineId,
  onOpenPost,
  onConfigureColumns,
  onNewTask,
}: {
  brandId: string;
  clientId: string;
  pipelineId: string;
  onOpenPost: (id: string) => void;
  onConfigureColumns?: () => void;
  onNewTask?: (stageId?: string) => void;
}) {
  const loadBoard = useServerFn(loadBoardFn);
  const queryKey = useMemo(
    () => ["content-board", brandId, clientId, pipelineId] as const,
    [brandId, clientId, pipelineId],
  );
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey,
    queryFn: () => loadBoard({ data: { brandId, clientId, pipelineId } }),
  });
  useEffect(() => {
    const channel = supabase
      .channel(`posts:${pipelineId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `pipeline_id=eq.${pipelineId}` },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pipelineId, qc, queryKey]);
  return (
    <ContentBoard
      board={data}
      boardQueryKey={queryKey}
      onOpenPost={onOpenPost}
      onConfigureColumns={onConfigureColumns}
      onNewTask={onNewTask}
    />
  );
}

function BoardExtras({
  brandId,
  clientId,
  pipelineId,
  openColumnConfig,
  setOpenColumnConfig,
  openNewTask,
  setOpenNewTask,
  newTaskStageId,
}: {
  brandId: string;
  clientId: string;
  pipelineId: string;
  openColumnConfig: boolean;
  setOpenColumnConfig: (v: boolean) => void;
  openNewTask: boolean;
  setOpenNewTask: (v: boolean) => void;
  newTaskStageId: string | null;
}) {
  const loadBoard = useServerFn(loadBoardFn);
  const queryKey = useMemo(
    () => ["content-board", brandId, clientId, pipelineId] as const,
    [brandId, clientId, pipelineId],
  );
  const { data } = useSuspenseQuery({
    queryKey,
    queryFn: () => loadBoard({ data: { brandId, clientId, pipelineId } }),
  });
  return (
    <>
      <ColumnConfigDialog
        open={openColumnConfig}
        onOpenChange={setOpenColumnConfig}
        pipelineId={pipelineId}
        stages={data.stages}
        invalidateKey={queryKey}
      />
      <NewPostDialog
        open={openNewTask}
        onOpenChange={setOpenNewTask}
        brandId={brandId}
        clientId={clientId}
        pipelineId={pipelineId}
        stages={data.stages}
        defaultStageId={newTaskStageId ?? data.stages[0]?.id}
        invalidateKey={queryKey}
      />
    </>
  );
}

function NewPipelineDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (!open) setName("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pipe-name">Nome</Label>
          <Input
            id="pipe-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Blog inbound"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(name.trim())} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-10 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-96 w-72 shrink-0 animate-pulse rounded-lg border border-border/60 bg-muted/30"
        />
      ))}
    </div>
  );
}

