import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  Sparkles,
  Upload,
  X,
  ImageIcon,
  FileText,
  RotateCcw,
  CheckCircle2,
  Link2,
  Copy as CopyIcon,
  ShieldX,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Wand2 } from "lucide-react";
import {
  createPostFn,
  updatePostFn,
  deletePostFn,
  reworkPostFn,
  getPostDetailFn,
  uploadPostReferenceMediaFn,
  removePostReferenceMediaFn,
  signPostReferenceMediaFn,
  type PipelineStage,
  type BoardPost,
  type PostTimelineEvent,
  type ScriptScene,
} from "@/lib/content.functions";
import { aiInlineGenerateFn } from "@/lib/copilot-inline.functions";
import {
  listApprovalTokensFn,
  createApprovalTokenFn,
  revokeApprovalTokenFn,
} from "@/lib/approval.functions";
import { supabase } from "@/integrations/supabase/client";
import { CHANNELS, FORMATS } from "./stage-colors";

type Priority = "low" | "medium" | "high" | "urgent";

type CommonProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandId: string;
  clientId: string;
  pipelineId: string;
  stages: PipelineStage[];
  invalidateKey: readonly unknown[];
};

type CreateProps = CommonProps & {
  mode: "create";
  defaultStageId?: string;
  postId?: never;
};

type EditProps = CommonProps & {
  mode: "edit";
  postId: string;
  defaultStageId?: never;
};

export type TaskDialogProps = CreateProps | EditProps;

export function TaskDialog(props: TaskDialogProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l bg-background p-0 sm:max-w-[640px]"
      >
        {props.mode === "edit" ? (
          <Suspense fallback={<LoadingBody />}>
            <EditBody {...props} />
          </Suspense>
        ) : (
          <CreateBody {...props} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function LoadingBody() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function QuickApprovalLinkButton({ postId }: { postId: string }) {
  const qc = useQueryClient();
  const createTok = useServerFn(createApprovalTokenFn);
  const m = useMutation({
    mutationFn: () => createTok({ data: { postId, expiresInDays: 14 } }),
    onSuccess: (t) => {
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}/approval/${t.token}`
          : `/approval/${t.token}`;
      void navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Link de aprovação copiado");
      qc.invalidateQueries({ queryKey: ["approval-tokens", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => m.mutate()}
      disabled={m.isPending}
    >
      {m.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
      Gerar link
    </Button>
  );
}

// ----------------- Create -----------------

function CreateBody({
  onOpenChange,
  brandId,
  clientId,
  pipelineId,
  stages,
  defaultStageId,
  invalidateKey,
}: CreateProps) {
  const qc = useQueryClient();
  const createPost = useServerFn(createPostFn);

  const [state, setState] = useState(() => emptyState(defaultStageId ?? stages[0]?.id ?? ""));

  useEffect(() => {
    setState(emptyState(defaultStageId ?? stages[0]?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultStageId, stages.length]);

  const create = useMutation({
    mutationFn: async () =>
      createPost({
        data: {
          brandId,
          clientId,
          pipelineId,
          stageId: state.stageId,
          title: state.title.trim(),
          channels: state.channels.length ? state.channels : undefined,
          format: state.format || null,
          copy: state.copy.trim() || null,
          internal_briefing: state.internalBriefing.trim() || null,
          client_briefing: state.clientBriefing.trim() || null,
          script: state.script.trim()
            ? [{ cena: 1, fala: state.script.trim() }]
            : null,
          scheduled_at: state.scheduledAt
            ? new Date(state.scheduledAt).toISOString()
            : null,
          remind_at: state.remindAt
            ? new Date(state.remindAt).toISOString()
            : null,
          priority: state.priority === "none" ? null : state.priority,
          tags: state.tags.length ? state.tags : undefined,
          visible_in_portal: state.visibleInPortal,
        },
      }),
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: invalidateKey });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="sticky top-0 z-10 border-b bg-background px-6 py-4">
        <h2 className="text-base font-semibold tracking-tight">Nova tarefa</h2>
        <p className="text-xs text-muted-foreground">
          Preencha os detalhes para adicionar ao pipeline.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <TaskLayout
          state={state}
          setState={setState}
          stages={stages}
          mode="create"
        />
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background px-6 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          onClick={() => create.mutate()}
          disabled={!state.title.trim() || !state.stageId || create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Criar
        </Button>
      </div>
    </>
  );
}

// ----------------- Edit -----------------

function EditBody({
  onOpenChange,
  brandId,
  clientId,
  pipelineId,
  stages,
  postId,
  invalidateKey,
}: EditProps) {
  const qc = useQueryClient();
  const getDetail = useServerFn(getPostDetailFn);
  const updatePost = useServerFn(updatePostFn);
  const deletePost = useServerFn(deletePostFn);
  const reworkPost = useServerFn(reworkPostFn);
  const uploadRef = useServerFn(uploadPostReferenceMediaFn);
  const removeRef = useServerFn(removePostReferenceMediaFn);
  const signRefs = useServerFn(signPostReferenceMediaFn);

  const { data } = useSuspenseQuery({
    queryKey: ["post-detail", postId],
    queryFn: () => getDetail({ data: { postId } }),
  });

  const post = data.post;
  const [state, setState] = useState(() => stateFromPost(post, stages));
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setState(stateFromPost(post, stages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const refs = Array.isArray(post.reference_media) ? post.reference_media : [];
  const reviewStatus = post.review_status ?? "pending";
  const aiPhase = post.ai_phase ?? null;

  const refsKey = refs.map((r) => r.path).join("|");
  useEffect(() => {
    const paths = refs.map((r) => r.path).filter(Boolean);
    if (paths.length === 0) {
      setSignedUrls({});
      return;
    }
    let cancelled = false;
    signRefs({ data: { paths } }).then((res) => {
      if (!cancelled) setSignedUrls(res.urls);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey]);

  const save = useMutation({
    mutationFn: () =>
      updatePost({
        data: {
          postId,
          patch: {
            title: state.title.trim(),
            copy: state.copy.trim() || null,
            internal_briefing: state.internalBriefing.trim() || null,
            client_briefing: state.clientBriefing.trim() || null,
            script: state.script.trim()
              ? [{ cena: 1, fala: state.script.trim() }]
              : null,
            channels: state.channels as never,
            format: state.format || null,
            priority: state.priority === "none" ? null : state.priority,
            tags: state.tags,
            visible_in_portal: state.visibleInPortal,
            scheduled_at: state.scheduledAt
              ? new Date(state.scheduledAt).toISOString()
              : null,
            remind_at: state.remindAt
              ? new Date(state.remindAt).toISOString()
              : null,
            stage_id: state.stageId || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Tarefa atualizada");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deletePost({ data: { postId } }),
    onSuccess: () => {
      toast.success("Tarefa excluída");
      qc.invalidateQueries({ queryKey: invalidateKey });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rework = useMutation({
    mutationFn: (notes: string) => reworkPost({ data: { postId, notes } }),
    onSuccess: () => {
      toast.success("Enviado para refação");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveOnly = useMutation({
    mutationFn: () =>
      updatePost({ data: { postId, patch: { review_status: "approved" } } }),
    onSuccess: () => {
      toast.success("Aprovado");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      return uploadRef({
        data: {
          postId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
        },
      });
    },
    onSuccess: () => {
      toast.success("Mídia anexada");
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMedia = useMutation({
    mutationFn: (path: string) => removeRef({ data: { postId, path } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleApproveAndGenerate() {
    setApproving(true);
    try {
      await updatePost({
        data: {
          postId,
          patch: {
            review_status: "approved",
            title: state.title.trim(),
            copy: state.copy.trim() || null,
          },
        },
      });
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/jobs/post-phase2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Fase 2 iniciada em segundo plano");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
      qc.invalidateQueries({ queryKey: ["ai-jobs", "active"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aprovar");
    } finally {
      setApproving(false);
    }
  }

  return (
    <>
      <div className="sticky top-0 z-10 space-y-3 border-b bg-background px-6 pb-3 pt-4">
        <div className="flex items-start gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <Input
              value={state.title}
              onChange={(e) => setState((p) => ({ ...p, title: e.target.value }))}
              placeholder="Nome do post"
              className="h-9 border-0 bg-transparent px-0 text-base font-semibold tracking-tight shadow-none focus-visible:ring-0"
            />
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {reviewStatus === "pending" && aiPhase === "idea" ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                  Aguardando aprovação
                </Badge>
              ) : null}
              {aiPhase === "copy_running" ? (
                <Badge variant="outline" className="border-indigo-500/40 text-indigo-600 dark:text-indigo-400">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Gerando copy
                </Badge>
              ) : null}
              {aiPhase === "copy_ready" ? (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                  Copy + Design prontos
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={state.stageId} onValueChange={(v) => setState((p) => ({ ...p, stageId: v }))}>
            <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1.5">
            <QuickApprovalLinkButton postId={postId} />
            {reviewStatus === "pending" && aiPhase === "idea" ? (
              <Button size="sm" onClick={handleApproveAndGenerate} disabled={approving}>
                {approving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Aprovar & gerar
              </Button>
            ) : reviewStatus !== "approved" ? (
              <Button size="sm" onClick={() => approveOnly.mutate()} disabled={approveOnly.isPending}>
                {approveOnly.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Aprovar
              </Button>
            ) : (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Aprovado
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <TaskLayout
          state={state}
          setState={setState}
          stages={stages}
          mode="edit"
          postId={postId}
        />

        <div className="mt-6 space-y-5">
          <Separator />
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> Mídias de referência
            <span className="text-xs font-normal text-muted-foreground">
              (feeds, stories, moodboard)
            </span>
          </Label>
          <div className="rounded-md border p-2">
            {refs.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                Anexe imagens que a IA usará como referência visual na Fase 2.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {refs.map((r) => {
                  const url = signedUrls[r.path];
                  const isImg = (r.type ?? "").startsWith("image/");
                  return (
                    <div
                      key={r.path}
                      className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                    >
                      {isImg && url ? (
                        <img
                          src={url}
                          alt={r.name ?? r.path}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center p-1 text-center">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                          <span className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                            {r.name}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 shadow transition group-hover:opacity-100"
                        onClick={() => removeMedia.mutate(r.path)}
                        title="Remover"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Anexar
              </Button>
            </div>
          </div>
        </div>

        {post.design_brief ? (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Briefing visual (IA)
            </Label>
            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
              {post.design_brief}
            </div>
          </div>
        ) : null}

          <Separator />
          <ApprovalLinkSection postId={postId} />
          <Separator />
          <Timeline items={data.timeline} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t bg-background px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm("Excluir esta tarefa?")) remove.mutate();
          }}
          disabled={remove.isPending}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const notes = window.prompt("Descreva o ajuste solicitado (opcional):") ?? "";
              rework.mutate(notes);
            }}
            disabled={rework.isPending}
          >
            {rework.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
            Refazer
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </div>
    </>
  );
}

// ----------------- Shared UI -----------------

type TaskState = {
  title: string;
  stageId: string;
  channels: string[];
  format: string;
  copy: string;
  internalBriefing: string;
  clientBriefing: string;
  script: string;
  scheduledAt: string;
  remindAt: string;
  priority: Priority | "none";
  tags: string[];
  visibleInPortal: boolean;
};

function emptyState(stageId: string): TaskState {
  return {
    title: "",
    stageId,
    channels: ["instagram"],
    format: "Feed",
    copy: "",
    internalBriefing: "",
    clientBriefing: "",
    script: "",
    scheduledAt: "",
    remindAt: "",
    priority: "none",
    tags: [],
    visibleInPortal: false,
  };
}

function stateFromPost(post: BoardPost, stages: PipelineStage[]): TaskState {
  const scriptText =
    Array.isArray(post.script) && post.script.length > 0
      ? (post.script as ScriptScene[])
          .map((s) => s.fala ?? s.observacao ?? "")
          .filter(Boolean)
          .join("\n\n")
      : "";
  return {
    title: post.title ?? "",
    stageId: post.stage_id ?? stages[0]?.id ?? "",
    channels: (post.channels ?? []) as string[],
    format: post.format ?? "",
    copy: post.copy ?? "",
    internalBriefing: post.internal_briefing ?? "",
    clientBriefing: post.client_briefing ?? "",
    script: scriptText,
    scheduledAt: post.scheduled_at ? post.scheduled_at.slice(0, 16) : "",
    remindAt: post.remind_at ? post.remind_at.slice(0, 16) : "",
    priority: (["low", "medium", "high", "urgent"].includes(post.priority ?? "")
      ? (post.priority as Priority)
      : "none"),
    tags: (post.tags ?? []) as string[],
    visibleInPortal: !!post.visible_in_portal,
  };
}

function TaskLayout({
  state,
  setState,
  stages,
  mode,
  postId,
}: {
  state: TaskState;
  setState: (fn: (prev: TaskState) => TaskState) => void;
  stages: PipelineStage[];
  mode: "create" | "edit";
  postId?: string;
}) {
  const [tagInput, setTagInput] = useState("");
  const set = <K extends keyof TaskState>(key: K, value: TaskState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));
  const toggleChannel = (id: string) =>
    setState((prev) => ({
      ...prev,
      channels: prev.channels.includes(id)
        ? prev.channels.filter((c) => c !== id)
        : [...prev.channels, id],
    }));
  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    setState((prev) =>
      prev.tags.includes(v) ? prev : { ...prev, tags: [...prev.tags, v] },
    );
    setTagInput("");
  };
  const removeTag = (t: string) =>
    setState((prev) => ({ ...prev, tags: prev.tags.filter((x) => x !== t) }));

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        {mode === "create" ? (
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Título *
            </Label>
            <Input
              value={state.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Nome da tarefa..."
              autoFocus
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Vai publicar? Selecione o canal
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => {
              const active = state.channels.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChannel(c.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:border-border"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Formato
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => set("format", f)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  state.format === f
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-border"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <CopyEditor
          value={state.copy}
          onChange={(v) => set("copy", v)}
          postId={mode === "edit" ? postId : undefined}
        />

        <Tabs defaultValue="internal" className="w-full">
          <TabsList variant="grid" className="grid w-full grid-cols-3">
            <TabsTrigger value="internal">Briefing interno</TabsTrigger>
            <TabsTrigger value="client">Briefing cliente</TabsTrigger>
            <TabsTrigger value="script">Roteiro</TabsTrigger>
          </TabsList>
          <TabsContent value="internal">
            <Textarea
              value={state.internalBriefing}
              onChange={(e) => set("internalBriefing", e.target.value)}
              rows={5}
              placeholder="Apenas equipe interna..."
            />
          </TabsContent>
          <TabsContent value="client">
            <Textarea
              value={state.clientBriefing}
              onChange={(e) => set("clientBriefing", e.target.value)}
              rows={5}
              placeholder="Visível no portal do cliente..."
            />
          </TabsContent>
          <TabsContent value="script" className="space-y-2">
            <Textarea
              value={state.script}
              onChange={(e) => set("script", e.target.value)}
              rows={5}
              placeholder="Roteiro / script do vídeo..."
            />
            {mode === "edit" && postId ? (
              <AiFieldButton
                postId={postId}
                field="script"
                label="Gerar roteiro"
                size="xs"
                onText={(t) => set("script", t)}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-5">
        {mode === "create" ? (
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Etapa
            </Label>
            <Select value={state.stageId} onValueChange={(v) => set("stageId", v)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Prazo
          </Label>
          <Input
            type="datetime-local"
            value={state.scheduledAt}
            onChange={(e) => set("scheduledAt", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Lembrete
          </Label>
          <Input
            type="datetime-local"
            value={state.remindAt}
            onChange={(e) => set("remindAt", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Prioridade
          </Label>
          <Select
            value={state.priority}
            onValueChange={(v) => set("priority", v as Priority | "none")}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem prioridade</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Tags
          </Label>
          <div className="flex flex-wrap gap-1">
            {state.tags.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => removeTag(t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Adicionar tag"
              className="h-8 text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={addTag}>
              +
            </Button>
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <Label className="text-xs">Visível no portal</Label>
          <Switch
            checked={state.visibleInPortal}
            onCheckedChange={(v) => set("visibleInPortal", v)}
          />
        </div>
      </div>
    </div>
  );
}

// ----------------- Sub-sections (edit only) -----------------

function Timeline({ items }: { items: PostTimelineEvent[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Histórico
      </p>
      <ul className="space-y-2 text-sm">
        {items.map((ev) => (
          <li key={ev.id} className="flex items-start gap-2">
            <Badge variant="secondary" className="mt-0.5 shrink-0 font-normal">
              {ev.verb}
            </Badge>
            <span className="text-muted-foreground">
              {new Date(ev.created_at).toLocaleString("pt-BR")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiFieldButton({
  postId,
  field,
  label,
  onText,
  size = "sm",
}: {
  postId: string;
  field: "copy" | "hashtags" | "cta" | "script" | "briefing";
  label: string;
  onText: (t: string) => void;
  size?: "xs" | "sm";
}) {
  const runAi = useServerFn(aiInlineGenerateFn);
  const m = useMutation({
    mutationFn: () => runAi({ data: { postId, field } }),
    onSuccess: (r: { text: string }) => {
      onText(r.text);
      toast.success(`${label} gerado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cls =
    size === "xs"
      ? "h-7 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 text-xs text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
      : "h-8 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 text-xs text-violet-700 hover:bg-violet-500/20 dark:text-violet-300";
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 ${cls}`}
      onClick={() => m.mutate()}
      disabled={m.isPending}
    >
      {m.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}

function ApprovalLinkSection({ postId }: { postId: string }) {
  const qc = useQueryClient();
  const listTokens = useServerFn(listApprovalTokensFn);
  const createTok = useServerFn(createApprovalTokenFn);
  const revokeTok = useServerFn(revokeApprovalTokenFn);

  const q = useQuery({
    queryKey: ["approval-tokens", postId],
    queryFn: () => listTokens({ data: { postId } }),
  });

  const create = useMutation({
    mutationFn: () => createTok({ data: { postId, expiresInDays: 14 } }),
    onSuccess: () => {
      toast.success("Link de aprovação gerado");
      qc.invalidateQueries({ queryKey: ["approval-tokens", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (tokenId: string) => revokeTok({ data: { tokenId } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["approval-tokens", postId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const active = useMemo(
    () =>
      (q.data ?? []).filter(
        (t) =>
          !t.revoked_at &&
          (!t.expires_at || new Date(t.expires_at).getTime() > Date.now()),
      ),
    [q.data],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Aprovação externa
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="mr-2 h-3.5 w-3.5" />
          )}
          Gerar link
        </Button>
      </div>
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum link ativo. Gere um link seguro para envio ao cliente aprovar
          sem login.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {active.map((t) => {
            const url =
              typeof window !== "undefined"
                ? `${window.location.origin}/approval/${t.token}`
                : `/approval/${t.token}`;
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs"
              >
                <code className="flex-1 truncate font-mono">{url}</code>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-muted"
                  onClick={() => {
                    void navigator.clipboard.writeText(url);
                    toast.success("Link copiado");
                  }}
                  title="Copiar"
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-destructive hover:bg-destructive/10"
                  onClick={() => revoke.mutate(t.id)}
                  title="Revogar"
                >
                  <ShieldX className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ----------------- Structured Copy Editor -----------------

type CopySections = {
  gancho: string;
  headline: string;
  body: string;
  cta: string;
  hashtags: string;
};

const EMPTY_SECTIONS: CopySections = {
  gancho: "",
  headline: "",
  body: "",
  cta: "",
  hashtags: "",
};

const SECTION_RE = /^###\s+(GANCHO|HEADLINE|COPY|CTA|HASHTAGS)\s*$/gim;

function parseCopySections(raw: string | null | undefined): CopySections {
  if (!raw) return { ...EMPTY_SECTIONS };
  const parts = raw.split(SECTION_RE);
  if (parts.length <= 1) return { ...EMPTY_SECTIONS, body: raw.trim() };
  const out: CopySections = { ...EMPTY_SECTIONS };
  for (let i = 1; i < parts.length; i += 2) {
    const key = (parts[i] ?? "").toLowerCase();
    const value = (parts[i + 1] ?? "").trim();
    if (key === "gancho") out.gancho = value;
    else if (key === "headline") out.headline = value;
    else if (key === "copy") out.body = value;
    else if (key === "cta") out.cta = value;
    else if (key === "hashtags") out.hashtags = value;
  }
  return out;
}

function serializeCopySections(sec: CopySections): string {
  const parts: string[] = [];
  if (sec.gancho.trim()) parts.push(`### GANCHO\n${sec.gancho.trim()}`);
  if (sec.headline.trim()) parts.push(`### HEADLINE\n${sec.headline.trim()}`);
  if (sec.body.trim()) parts.push(`### COPY\n${sec.body.trim()}`);
  if (sec.cta.trim()) parts.push(`### CTA\n${sec.cta.trim()}`);
  if (sec.hashtags.trim()) parts.push(`### HASHTAGS\n${sec.hashtags.trim()}`);
  return parts.join("\n\n");
}

const COPY_FIELDS: Array<{
  key: keyof CopySections;
  label: string;
  placeholder: string;
  rows: number;
  aiField?: "copy" | "hashtags" | "cta";
}> = [
  { key: "gancho", label: "HOOK", placeholder: "Primeira linha que segura o scroll…", rows: 2 },
  { key: "headline", label: "Headline", placeholder: "Ideia central em uma frase…", rows: 2 },
  { key: "body", label: "Copy principal", placeholder: "Desenvolva o argumento…", rows: 6, aiField: "copy" },
  { key: "cta", label: "CTA", placeholder: "Chamada para ação…", rows: 2, aiField: "cta" },
  { key: "hashtags", label: "Hashtags", placeholder: "#marca #categoria #campanha", rows: 2, aiField: "hashtags" },
];

function CopyEditor({
  value,
  onChange,
  postId,
}: {
  value: string;
  onChange: (next: string) => void;
  postId?: string;
}) {
  const sections = useMemo(() => parseCopySections(value), [value]);
  const setSection = (key: keyof CopySections, next: string) => {
    onChange(serializeCopySections({ ...sections, [key]: next }));
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background">
      {COPY_FIELDS.map((f, i) => (
        <div
          key={f.key}
          className={`px-3 py-3 ${i > 0 ? "border-t border-border/60" : ""}`}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {f.label}
            </span>
            <div className="flex items-center gap-1">
              {postId && f.aiField ? (
                <>
                  <MicroAiButton
                    postId={postId}
                    field={f.aiField}
                    tooltip="Regenerar com IA"
                    icon="sparkles"
                    onText={(t) => setSection(f.key, t)}
                  />
                  <MicroAiButton
                    postId={postId}
                    field={f.aiField}
                    tooltip="Melhorar tom"
                    icon="wand"
                    onText={(t) => setSection(f.key, t)}
                  />
                </>
              ) : null}
            </div>
          </div>
          <Textarea
            value={sections[f.key]}
            onChange={(e) => setSection(f.key, e.target.value)}
            placeholder={f.placeholder}
            rows={f.rows}
            className="min-h-0 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
          />
        </div>
      ))}
    </div>
  );
}

function MicroAiButton({
  postId,
  field,
  tooltip,
  icon,
  onText,
}: {
  postId: string;
  field: "copy" | "hashtags" | "cta" | "script" | "briefing";
  tooltip: string;
  icon: "sparkles" | "wand";
  onText: (t: string) => void;
}) {
  const runAi = useServerFn(aiInlineGenerateFn);
  const m = useMutation({
    mutationFn: () => runAi({ data: { postId, field } }),
    onSuccess: (r: { text: string }) => {
      onText(r.text);
      toast.success("Atualizado com IA");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const Icon = icon === "sparkles" ? Sparkles : Wand2;
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onClick={() => m.mutate()}
      disabled={m.isPending}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-600 transition hover:bg-violet-500/20 disabled:opacity-60 dark:text-violet-300"
    >
      {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
    </button>
  );
}