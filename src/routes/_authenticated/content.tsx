import { Suspense, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
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
    <div className="flex flex-col gap-4">
      {effectivePipelineId ? (
        <Suspense fallback={<BoardSkeleton />}>
          <BoardView
            brandId={brandId}
            clientId={clientId}
            pipelineId={effectivePipelineId}
            onOpenPost={setOpenPostId}
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
    </div>
  );
}

function BoardView({
  brandId,
  clientId,
  pipelineId,
  onOpenPost,
}: {
  brandId: string;
  clientId: string;
  pipelineId: string;
  onOpenPost: (id: string) => void;
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
  return <ContentBoard board={data} boardQueryKey={queryKey} onOpenPost={onOpenPost} />;
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

// legacy placeholder to satisfy old default posts constant removal
const _legacyMockPosts: unknown[] = [
  { id: "p1", title: "Fall collection launch — carousel", client: "Nova Studio", color: "#f97316", stage: "briefing", channel: "instagram", due: "07/12", assignee: "AM", aiScore: 0 },
  { id: "p2", title: "Client case: 3.4x ROI in 90 days", client: "Ativa B2B", color: "#3b82f6", stage: "writing", channel: "linkedin", due: "07/10", assignee: "LR", aiScore: 62 },
  { id: "p3", title: "Reels: 3 funnel mistakes", client: "Ativa B2B", color: "#3b82f6", stage: "writing", channel: "tiktok", due: "07/11", assignee: "AI", aiScore: 78 },
  { id: "p4", title: "Educational post — LGPD for clinics", client: "Vitta Saúde", color: "#10b981", stage: "design", channel: "instagram", due: "07/13", assignee: "DP", aiScore: 84 },
  { id: "p5", title: "Senior role announcement", client: "Nova Studio", color: "#f97316", stage: "review", channel: "linkedin", due: "07/09", assignee: "AM", aiScore: 91 },
  { id: "p6", title: "Client testimonial — captioned video", client: "Vitta Saúde", color: "#10b981", stage: "approved", channel: "instagram", due: "07/08", assignee: "DP", aiScore: 96 },
  { id: "p7", title: "'Behind the scenes' series — ep. 04", client: "Nova Studio", color: "#f97316", stage: "scheduled", channel: "instagram", due: "07/07", assignee: "AM", aiScore: 98 },
];

const channelIcon = {
  instagram: Instagram,
  linkedin: Linkedin,
  tiktok: MessageCircle,
};

function ContentPage() {
  usePageHeader({
    title: "Pipeline de conteúdo",
    subtitle: "Fluxo semanal · 7 posts em produção · 2 urgentes",
    actions: (
      <Button size="sm" className="gap-2">
        <Sparkles className="h-3.5 w-3.5" /> Novo post com IA
      </Button>
    ),
  });
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {stages.map((s) => {
          const items = posts.filter((p) => p.stage === s.id);
          return (
            <div key={s.id} className="flex w-72 shrink-0 flex-col rounded-lg border border-border/60 bg-card/40">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                <div>
                  <div className="text-xs font-medium">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">{s.hint}</div>
                </div>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{items.length}</Badge>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.map((p) => {
                  const Icon = channelIcon[p.channel];
                  return (
                    <div key={p.id} className="group cursor-pointer rounded-md border border-border/60 bg-background/60 p-3 transition hover:border-primary/40 hover:bg-background">
                      <div className="mb-2 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.client}</span>
                      </div>
                      <div className="mb-3 text-xs font-medium leading-snug">{p.title}</div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3 w-3" />
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{p.due}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.aiScore > 0 && (
                            <span className="flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 font-mono text-primary">
                              <Sparkles className="h-2.5 w-2.5" />{p.aiScore}
                            </span>
                          )}
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[9px]">{p.assignee}</AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}