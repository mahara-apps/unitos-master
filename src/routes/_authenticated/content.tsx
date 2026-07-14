import { Suspense, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Layers, Loader2, Pencil, Plus, Settings } from "lucide-react";
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
  renamePipelineFn,
} from "@/lib/content.functions";
import { ContentBoard } from "@/components/content/content-board";
import { ColumnConfigDialog } from "@/components/content/column-config-dialog";
import { TaskDialog } from "@/components/content/task-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelCard } from "@/components/ui/panel-card";
import { PanelEmptyState } from "@/components/ui/panel-empty";

export const Route = createFileRoute("/_authenticated/content")({
  validateSearch: (s: Record<string, unknown>) =>
    z
      .object({
        project: z.string().uuid().optional(),
        new: z.coerce.boolean().optional(),
      })
      .parse(s),
  component: ContentPage,
});

function ContentPage() {
  const { brandId, clientId } = useActiveContext();
  const search = Route.useSearch();

  if (!brandId) {
    return (
      <BoardEmpty
        title="Selecione um workspace"
        description="Escolha um workspace na barra lateral para visualizar o pipeline de conteúdo."
      />
    );
  }
  if (!clientId) {
    return (
      <BoardEmpty
        title="Selecione uma conta"
        description="O pipeline de conteúdo é organizado por cliente. Selecione uma conta ativa."
      />
    );
  }

  return (
    <ContentReady
      brandId={brandId}
      clientId={clientId}
      defaultProjectId={search.project ?? null}
      autoOpenNewTask={!!search.new}
    />
  );
}

function ContentReady({
  brandId,
  clientId,
  defaultProjectId,
  autoOpenNewTask,
}: {
  brandId: string;
  clientId: string;
  defaultProjectId: string | null;
  autoOpenNewTask: boolean;
}) {
  const qc = useQueryClient();
  const listPipelines = useServerFn(listPipelinesFn);
  const ensureDefault = useServerFn(ensureDefaultPipelineFn);
  const createPipeline = useServerFn(createPipelineFn);
  const renamePipeline = useServerFn(renamePipelineFn);

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
  const [openRenamePipeline, setOpenRenamePipeline] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openColumnConfig, setOpenColumnConfig] = useState(false);
  const [newTaskStageId, setNewTaskStageId] = useState<string | null>(null);
  const [openNewTask, setOpenNewTask] = useState(false);

  useEffect(() => {
    if (autoOpenNewTask) {
      setNewTaskStageId(null);
      setOpenNewTask(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNewTask]);

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Configurações do pipeline">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOpenNewPipeline(true)}>
                <Plus className="mr-2 h-4 w-4" /> Novo pipeline
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setOpenRenamePipeline(true)}
                disabled={!effectivePipelineId}
              >
                <Pencil className="mr-2 h-4 w-4" /> Renomear pipeline
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenColumnConfig(true)}>
                <Settings className="mr-2 h-4 w-4" /> Colunas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => { setNewTaskStageId(null); setOpenNewTask(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
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

  const renameMutation = useMutation({
    mutationFn: ({ pipelineId, name }: { pipelineId: string; name: string }) =>
      renamePipeline({ data: { pipelineId, name } }),
    onSuccess: () => {
      setOpenRenamePipeline(false);
      qc.invalidateQueries({ queryKey: ["content-pipelines", brandId, clientId] });
      toast.success("Pipeline renomeado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
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

      <RenamePipelineDialog
        open={openRenamePipeline}
        onOpenChange={setOpenRenamePipeline}
        currentName={pipelines.find((p) => p.id === effectivePipelineId)?.name ?? ""}
        onSubmit={(name) => {
          if (!effectivePipelineId) return;
          renameMutation.mutate({ pipelineId: effectivePipelineId, name });
        }}
        pending={renameMutation.isPending}
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
            defaultProjectId={defaultProjectId}
            openPostId={openPostId}
            setOpenPostId={setOpenPostId}
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
  defaultProjectId,
  openPostId,
  setOpenPostId,
}: {
  brandId: string;
  clientId: string;
  pipelineId: string;
  openColumnConfig: boolean;
  setOpenColumnConfig: (v: boolean) => void;
  openNewTask: boolean;
  setOpenNewTask: (v: boolean) => void;
  newTaskStageId: string | null;
  defaultProjectId?: string | null;
  openPostId: string | null;
  setOpenPostId: (v: string | null) => void;
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
      <TaskDialog
        mode="create"
        open={openNewTask}
        onOpenChange={setOpenNewTask}
        brandId={brandId}
        clientId={clientId}
        pipelineId={pipelineId}
        stages={data.stages}
        defaultStageId={newTaskStageId ?? data.stages[0]?.id}
        defaultProjectId={defaultProjectId ?? null}
        invalidateKey={queryKey}
      />
      {openPostId ? (
        <TaskDialog
          mode="edit"
          open={!!openPostId}
          onOpenChange={(o) => !o && setOpenPostId(null)}
          brandId={brandId}
          clientId={clientId}
          pipelineId={pipelineId}
          stages={data.stages}
          postId={openPostId}
          invalidateKey={queryKey}
        />
      ) : null}
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

function BoardEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <PanelCard title={title} subtitle={description} icon={<Layers className="h-4 w-4" />}>
        <PanelEmptyState
          icon={<Layers className="h-5 w-5" />}
          text="Nenhum conteúdo para exibir com o contexto atual."
        />
      </PanelCard>
    </div>
  );
}

function RenamePipelineDialog({
  open,
  onOpenChange,
  currentName,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentName: string;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(currentName);
  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);
  const trimmed = name.trim();
  const unchanged = trimmed === currentName.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pipe-rename">Nome</Label>
          <Input
            id="pipe-rename"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSubmit(trimmed)}
            disabled={pending || !trimmed || unchanged}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

