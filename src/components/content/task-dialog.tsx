import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  ChevronLeft,
  ChevronRight,
  Play,
  Images,
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
  generatePostReferenceImageFn,
  listBrandAssigneesFn,
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
import { listClientChannelAssignmentsFn, type ClientChannelRow } from "@/lib/client-channels.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CHANNELS, CHANNEL_STYLES, FORMATS, FORMAT_STYLES, PRIORITY_STYLES } from "./stage-colors";
import { type PlacementFormat } from "@/lib/placements.functions";
import { listProjects } from "@/lib/projects.functions";
import { FolderKanban } from "lucide-react";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { describeError } from "@/lib/errors";

// UI helpers to bridge display strings ("Feed"/"Story"/"Reels"/"Carrossel")
// used elsewhere in this component with the DB enum used by placements.
const FORMAT_TO_ENUM: Record<string, PlacementFormat> = {
  Feed: "feed",
  feed: "feed",
  Story: "stories",
  Stories: "stories",
  stories: "stories",
  Reels: "reels",
  reels: "reels",
  Carrossel: "carrossel",
  Carousel: "carrossel",
  carrossel: "carrossel",
};
const ENUM_TO_LABEL: Record<PlacementFormat, string> = {
  feed: "Feed",
  stories: "Stories",
  reels: "Reels",
  carrossel: "Carrossel",
};
function toEnum(f: string | null | undefined): PlacementFormat {
  if (!f) return "feed";
  return FORMAT_TO_ENUM[f] ?? "feed";
}

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
  defaultScheduledAt?: string; // ISO string; pre-fills scheduled date/time
  defaultProjectId?: string | null;
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
        className="flex w-full flex-col gap-0 border-l border-border/60 bg-background p-0 sm:max-w-[640px]"
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
    onError: (e: Error) => toast.error(describeError(e)),
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

function AssigneeSelect({
  brandId,
  value,
  onChange,
  className,
}: {
  brandId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const fetchMembers = useServerFn(listBrandAssigneesFn);
  const { data: members } = useQuery({
    queryKey: ["brand-assignees", brandId],
    queryFn: () => fetchMembers({ data: { brandId } }),
    staleTime: 60_000,
    enabled: !!brandId,
  });
  const list = members ?? [];
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => onChange(v === "none" ? null : v)}
    >
      <SelectTrigger className={cn("h-9 w-full min-w-0 gap-1 text-xs", className)}>
        <SelectValue placeholder="Sem responsável" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="inline-flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">
              ·
            </span>
            Sem responsável
          </span>
        </SelectItem>
        {list.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="inline-flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                {initials(m.name)}
              </span>
              {m.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ----------------- Create -----------------

function ProjectSelect({
  brandId,
  clientId,
  value,
  onChange,
  className,
}: {
  brandId: string;
  clientId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const fetchProjects = useServerFn(listProjects);
  const { data } = useQuery({
    queryKey: ["projects", brandId, clientId, "picker"],
    queryFn: () => fetchProjects({ data: { brandId, clientId } }),
    staleTime: 60_000,
    enabled: !!brandId && !!clientId,
  });
  const projects = (data?.projects ?? []) as Array<{ id: string; name: string; color: string | null; status: string }>;
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => onChange(v === "none" ? null : v)}
    >
      <SelectTrigger className={cn("h-9 w-full min-w-0 gap-1 text-xs", className)}>
        <FolderKanban className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="Sem projeto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sem projeto</SelectItem>
        {projects
          .filter((p) => p.status !== "archived")
          .map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: p.color ?? "#8b5cf6" }}
                />
                {p.name}
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function CreateBody({
  onOpenChange,
  brandId,
  clientId,
  pipelineId,
  stages,
  defaultStageId,
  defaultScheduledAt,
  defaultProjectId,
  invalidateKey,
}: CreateProps) {
  const qc = useQueryClient();
  const createPost = useServerFn(createPostFn);

  const [state, setState] = useState(() => {
    const s = emptyState(defaultStageId ?? stages[0]?.id ?? "");
    if (defaultScheduledAt) s.scheduledAt = toLocalInputValue(defaultScheduledAt);
    if (defaultProjectId) s.projectId = defaultProjectId;
    return s;
  });

  useEffect(() => {
    const s = emptyState(defaultStageId ?? stages[0]?.id ?? "");
    if (defaultScheduledAt) s.scheduledAt = toLocalInputValue(defaultScheduledAt);
    if (defaultProjectId) s.projectId = defaultProjectId;
    setState(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultStageId, stages.length, defaultScheduledAt, defaultProjectId]);

  // Pré-seleciona o usuário atual como responsável ao abrir em criação.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      if (!uid || cancelled) return;
      setState((p) => (p.assigneeId ? p : { ...p, assigneeId: uid }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
          target_connection_ids: state.targetConnectionIds.length
            ? state.targetConnectionIds
            : undefined,
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
          assignees: state.assigneeId ? [state.assigneeId] : undefined,
          project_id: state.projectId ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["projects", brandId] });
      if (state.projectId) qc.invalidateQueries({ queryKey: ["project", brandId, state.projectId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  return (
    <>
      <div className="sticky top-0 z-10 space-y-3 border-b border-border/60 bg-background/95 px-6 pb-3 pt-4 backdrop-blur">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Nova tarefa</h2>
          <p className="text-xs text-muted-foreground">
            Preencha os detalhes para adicionar ao pipeline.
          </p>
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <Select value={state.stageId} onValueChange={(v) => setState((p) => ({ ...p, stageId: v }))}>
            <SelectTrigger className="h-9 w-full min-w-0 gap-1 text-xs">
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
          <AssigneeSelect
            brandId={brandId}
            value={state.assigneeId}
            onChange={(id) => setState((p) => ({ ...p, assigneeId: id }))}
          />
          <ProjectSelect
            brandId={brandId}
            clientId={clientId}
            value={state.projectId}
            onChange={(id) => setState((p) => ({ ...p, projectId: id }))}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <TaskLayout
          state={state}
          setState={setState}
          stages={stages}
          mode="create"
          brandId={brandId}
          clientId={clientId}
        />
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
        <Button variant="ghost" className="h-9" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          className="h-9"
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
  const generateRefImage = useServerFn(generatePostReferenceImageFn);

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
    mutationFn: async () => {
      await updatePost({
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
            target_connection_ids: state.targetConnectionIds,
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
            assignee_id: state.assigneeId,
            project_id: state.projectId,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Tarefa atualizada");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
      qc.invalidateQueries({ queryKey: ["projects", brandId] });
      if (state.projectId) qc.invalidateQueries({ queryKey: ["project", brandId, state.projectId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  const remove = useMutation({
    mutationFn: () => deletePost({ data: { postId } }),
    onSuccess: () => {
      toast.success("Tarefa excluída");
      qc.invalidateQueries({ queryKey: invalidateKey });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  const rework = useMutation({
    mutationFn: (notes: string) => reworkPost({ data: { postId, notes } }),
    onSuccess: () => {
      toast.success("Enviado para refação");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  const approveOnly = useMutation({
    mutationFn: () =>
      updatePost({ data: { postId, patch: { review_status: "approved" } } }),
    onSuccess: () => {
      toast.success("Aprovado");
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  // Autosave apenas do campo copy (Hook/Headline/Copy/CTA/Hashtags serializados)
  // para evitar perda de texto gerado por IA quando o drawer é fechado sem Save.
  const [copyAutosaveStatus, setCopyAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const initialCopyRef = useRef(state.copy);
  useEffect(() => {
    initialCopyRef.current = post.copy ?? "";
  }, [post.id, post.copy]);
  useEffect(() => {
    if (state.copy === initialCopyRef.current) return;
    setCopyAutosaveStatus("saving");
    const handle = setTimeout(async () => {
      try {
        await updatePost({
          data: { postId, patch: { copy: state.copy.trim() || null } },
        });
        initialCopyRef.current = state.copy;
        setCopyAutosaveStatus("saved");
        qc.invalidateQueries({ queryKey: ["post-detail", postId] });
      } catch {
        setCopyAutosaveStatus("idle");
      }
    }, 1200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.copy, postId]);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const isImage = (f: File) => f.type.startsWith("image/");
      const isVideo = (f: File) => f.type.startsWith("video/");
      const existingCount = refs.length;
      let uploaded = 0;
      for (const file of files) {
        // Size guard on the client (server also enforces).
        const max = isVideo(file) ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
        if (file.size > max) {
          toast.error(
            `${file.name}: excede o limite (${isVideo(file) ? "100 MB" : "25 MB"})`,
          );
          continue;
        }
        if (!isImage(file) && !isVideo(file)) {
          toast.error(`${file.name}: formato não suportado`);
          continue;
        }
        try {
          const base64 = await fileToBase64(file);
          const res = await uploadRef({
            data: {
              postId,
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              base64,
            },
          });
          uploaded += 1;
          // Generate thumbnail (best-effort) and attach to the same entry.
          try {
            const thumb = await generateThumbnail(file);
            if (thumb) {
              const thumbB64 = await blobToBase64(thumb);
              await uploadRef({
                data: {
                  postId,
                  filename: `thumb-${file.name.replace(/\.[^.]+$/, "")}.webp`,
                  contentType: "image/webp",
                  base64: thumbB64,
                  variant: "thumb",
                  originalPath: res.path,
                },
              });
            }
          } catch (thumbErr) {
            console.warn("thumb failed", thumbErr);
          }
        } catch (err) {
          toast.error(
            `${file.name}: ${(err as Error).message ?? "falha ao enviar"}`,
          );
        }
      }
      return { uploaded, totalAfter: existingCount + uploaded };
    },
    onSuccess: (r) => {
      if (r.uploaded > 0) {
        toast.success(
          r.uploaded === 1 ? "Mídia anexada" : `${r.uploaded} mídias anexadas`,
        );
        // Auto-carrossel when ending with 2+ media (except Story format).
        if (r.totalAfter >= 2 && state.format !== "Story") {
          if (state.format !== "Carrossel") {
            setState((s) => ({ ...s, format: "Carrossel" }));
            toast.info("Formato ajustado para Carrossel");
          }
        } else if (r.totalAfter <= 1 && state.format === "Carrossel") {
          setState((s) => ({ ...s, format: "Feed" }));
        }
      }
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  const removeMedia = useMutation({
    mutationFn: (path: string) => removeRef({ data: { postId, path } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(describeError(e)),
  });

  const generateMedia = useMutation({
    mutationFn: () => generateRefImage({ data: { postId } }),
    onSuccess: () => {
      toast.success("Imagem gerada pela IA");
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(describeError(e)),
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
      <div className="sticky top-0 z-10 space-y-3 border-b border-border/60 bg-background/95 px-6 pb-3 pt-4 backdrop-blur">
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
                <Badge variant="outline" className="rounded-md border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  Aguardando aprovação
                </Badge>
              ) : null}
              {aiPhase === "copy_running" ? (
                <Badge variant="outline" className="rounded-md border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Gerando copy
                </Badge>
              ) : null}
              {aiPhase === "copy_ready" ? (
                <Badge variant="outline" className="rounded-md border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Copy + Design prontos
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.25fr)] items-center gap-2">
          <Select value={state.stageId} onValueChange={(v) => setState((p) => ({ ...p, stageId: v }))}>
            <SelectTrigger className="h-9 w-full min-w-0 gap-1 text-xs">
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
          <AssigneeSelect
            brandId={brandId}
            value={state.assigneeId}
            onChange={(id) => setState((p) => ({ ...p, assigneeId: id }))}
          />
          <ProjectSelect
            brandId={brandId}
            clientId={clientId}
            value={state.projectId}
            onChange={(id) => setState((p) => ({ ...p, projectId: id }))}
          />
          <div className="flex items-center justify-end">
            {reviewStatus === "pending" && aiPhase === "idea" ? (
              <Button size="sm" onClick={handleApproveAndGenerate} disabled={approving} className="h-9 w-full">
                {approving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Aprovar & gerar
              </Button>
            ) : reviewStatus !== "approved" ? (
              <Button size="sm" onClick={() => approveOnly.mutate()} disabled={approveOnly.isPending} className="h-9 w-full">
                {approveOnly.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Aprovar
              </Button>
            ) : (
              <Badge variant="outline" className="h-9 w-full justify-center rounded-md border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
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
          createdAt={post.created_at}
          copyAutosaveStatus={copyAutosaveStatus}
          brandId={brandId}
          clientId={clientId}
          mediaSlot={
            <MediaReferenceBlock
              refs={refs}
              signedUrls={signedUrls}
              fileInput={fileInput}
              onFiles={(fs) => upload.mutate(fs)}
              onRemove={(p) => removeMedia.mutate(p)}
              onGenerate={() => generateMedia.mutate()}
              uploading={upload.isPending}
              generating={generateMedia.isPending}
            />
          }
        />

        <div className="mt-6 space-y-5">
          <Separator />
        {post.design_brief ? (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Briefing visual (IA)
            </Label>
            <DashboardPanelSurface className="bg-background/60 p-3 text-sm whitespace-pre-wrap">
              {post.design_brief}
            </DashboardPanelSurface>
          </div>
        ) : null}

          <Separator />
          <Timeline items={data.timeline} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
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
          <Button size="sm" className="h-9" onClick={() => save.mutate()} disabled={save.isPending}>
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
  assigneeId: string | null;
  channels: string[];
  targetConnectionIds: string[];
  format: string;
  destinations: Array<{ connectionId: string; channel: string; format: PlacementFormat }>;
  copy: string;
  internalBriefing: string;
  clientBriefing: string;
  script: string;
  scheduledAt: string;
  remindAt: string;
  priority: Priority | "none";
  tags: string[];
  visibleInPortal: boolean;
  projectId: string | null;
};

function emptyState(stageId: string): TaskState {
  return {
    title: "",
    stageId,
    assigneeId: null,
    channels: [],
    targetConnectionIds: [],
    format: "Feed",
    destinations: [],
    copy: "",
    internalBriefing: "",
    clientBriefing: "",
    script: "",
    scheduledAt: "",
    remindAt: "",
    priority: "none",
    tags: [],
    visibleInPortal: false,
    projectId: null,
  };
}

// Formats ISO string into <input type="datetime-local"> value in the user's
// local timezone (YYYY-MM-DDTHH:mm).
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stateFromPost(
  post: BoardPost,
  stages: PipelineStage[],
  destinations: Array<{ connectionId: string; channel: string; format: PlacementFormat }> = [],
): TaskState {
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
    assigneeId: (post.assignee_id ?? null) as string | null,
    channels: (post.channels ?? []) as string[],
    targetConnectionIds: (post.target_connection_ids ?? []) as string[],
    format: post.format ?? "",
    destinations,
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
    projectId: (post.project_id ?? null) as string | null,
  };
}

function TaskLayout({
  state,
  setState,
  stages,
  mode,
  postId,
  createdAt,
  copyAutosaveStatus,
  mediaSlot,
  brandId,
  clientId,
}: {
  state: TaskState;
  setState: (fn: (prev: TaskState) => TaskState) => void;
  stages: PipelineStage[];
  mode: "create" | "edit";
  postId?: string;
  createdAt?: string | null;
  copyAutosaveStatus?: "idle" | "saving" | "saved";
  mediaSlot?: ReactNode;
  brandId?: string;
  clientId?: string;
}) {
  const [tagInput, setTagInput] = useState("");
  const listClientChannels = useServerFn(listClientChannelAssignmentsFn);
  const clientChannelsQ = useQuery({
    enabled: !!(brandId && clientId),
    queryKey: ["task-dialog-client-channels", brandId, clientId],
    queryFn: () => listClientChannels({ data: { brandId: brandId!, clientId: clientId! } }),
  });
  const assignedConnections = (clientChannelsQ.data ?? []).filter((r) => r.assigned);
  const set = <K extends keyof TaskState>(key: K, value: TaskState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));
  const toggleChannel = (id: string) =>
    setState((prev) => ({
      ...prev,
      channels: prev.channels.includes(id)
        ? prev.channels.filter((c) => c !== id)
        : [...prev.channels, id],
    }));
  const toggleTargetConnection = (row: ClientChannelRow) =>
    setState((prev) => {
      const has = prev.targetConnectionIds.includes(row.connectionId);
      const nextIds = has
        ? prev.targetConnectionIds.filter((id) => id !== row.connectionId)
        : [...prev.targetConnectionIds, row.connectionId];
      // Deriva channels a partir das conexões selecionadas (para preservar
      // compat com filtros/legendas atuais que ainda usam posts.channels).
      // Nota: só entra no array quando não é adição de string livre.
      return { ...prev, targetConnectionIds: nextIds };
    });
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
            <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
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
          <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Vai publicar? Selecione a conta de destino
          </Label>
          {assignedConnections.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              {clientChannelsQ.isLoading
                ? "Carregando canais do cliente..."
                : "Nenhum canal social vinculado a este cliente. Vincule contas em Perfil do Cliente › Canais para poder agendar publicações."}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHANNELS.filter((c) => c.id === "blog" || c.id === "graphic").map((c) => {
                  const active = state.channels.includes(c.id);
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleChannel(c.id)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition ${
                        active
                          ? CHANNEL_STYLES[c.id] ?? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {assignedConnections.map((row) => {
                const meta = CHANNELS.find((c) => c.id === row.channel);
                const Icon = meta?.icon;
                const active = state.targetConnectionIds.includes(row.connectionId);
                return (
                  <button
                    key={row.connectionId}
                    type="button"
                    onClick={() => toggleTargetConnection(row)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition ${
                      active
                        ? CHANNEL_STYLES[row.channel] ?? "border-primary bg-primary/10 text-foreground"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                    title={row.accountLabel ?? row.channel}
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                    <span className="truncate max-w-[140px]">
                      {row.accountLabel ?? meta?.label ?? row.channel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Formato
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => set("format", f)}
                className={`h-8 rounded-md border px-3 text-xs font-medium transition ${
                  state.format === f
                    ? FORMAT_STYLES[f] ?? "border-primary bg-primary/10 text-foreground"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {mediaSlot ? <div>{mediaSlot}</div> : null}

        <div className="space-y-1">
          <CopyEditor
            value={state.copy}
            onChange={(v) => set("copy", v)}
            postId={mode === "edit" ? postId : undefined}
          />
          {mode === "edit" ? (
            <div className="flex justify-end px-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {copyAutosaveStatus === "saving"
                ? "Salvando…"
                : copyAutosaveStatus === "saved"
                  ? "Salvo automaticamente"
                  : ""}
            </div>
          ) : null}
        </div>

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
            <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
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
          <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Data de publicação
          </Label>
          <Input
            type="datetime-local"
            value={state.scheduledAt}
            onChange={(e) => set("scheduledAt", e.target.value)}
          />
          {mode === "edit" && createdAt ? (
            <p className="text-[11px] text-muted-foreground">
              Criado em {new Date(createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Lembrete <span className="normal-case text-muted-foreground/70">(opcional)</span>
          </Label>
          <Input
            type="datetime-local"
            value={state.remindAt}
            onChange={(e) => set("remindAt", e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Você receberá uma notificação no sistema neste horário.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
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
              <SelectItem value="none"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-zinc-400" />Sem prioridade</span></SelectItem>
              <SelectItem value="low"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" />Baixa</span></SelectItem>
              <SelectItem value="medium"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" />Média</span></SelectItem>
              <SelectItem value="high"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" />Alta</span></SelectItem>
              <SelectItem value="urgent"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-600" />Urgente</span></SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Tags
          </Label>
          <div className="flex flex-wrap gap-1">
            {state.tags.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="h-6 cursor-pointer rounded-md border border-border/60 bg-background/60 text-[11px] font-medium text-muted-foreground hover:text-foreground"
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
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={addTag}>
              +
            </Button>
          </div>
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
            <Label className="text-xs">Visível no portal</Label>
            <Switch
              checked={state.visibleInPortal}
              onCheckedChange={(v) => set("visibleInPortal", v)}
            />
          </div>
          {mode === "edit" && postId ? (
            <ApprovalLinkSection postId={postId} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ----------------- Sub-sections (edit only) -----------------

const VERB_LABELS: Record<string, string> = {
  created: "Criado",
  updated: "Atualizado",
  stage_changed: "Estágio alterado",
  approved: "Aprovado",
  rework_requested: "Refação solicitada",
  media_uploaded: "Mídia anexada",
  media_removed: "Mídia removida",
  media_generated: "Mídia gerada por IA",
  assignee_changed: "Responsável alterado",
  scheduled: "Agendado",
  published: "Publicado",
  copy_generated: "Copy gerada",
  design_generated: "Design gerado",
  ai_phase_started: "Fase de IA iniciada",
  ai_phase_completed: "Fase de IA concluída",
  comment_added: "Comentário adicionado",
  approval_link_created: "Link de aprovação criado",
  approval_link_revoked: "Link de aprovação revogado",
  client_approved: "Aprovado pelo cliente",
  client_rejected: "Rejeitado pelo cliente",
};

function translateVerb(v: string): string {
  return (
    VERB_LABELS[v] ??
    v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function Timeline({ items }: { items: PostTimelineEvent[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        Histórico
      </p>
      <ul className="space-y-2 text-sm">
        {items.map((ev) => {
          const when = new Date(ev.created_at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <li key={ev.id} className="flex items-start gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
              <Badge variant="secondary" className="mt-0.5 shrink-0 rounded-md border border-border/60 bg-card font-normal">
                {translateVerb(ev.verb)}
              </Badge>
              <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
                {ev.actor_avatar ? (
                  <img
                    src={ev.actor_avatar}
                    alt={ev.actor_name ?? ""}
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : ev.actor_name ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                    {initialsOf(ev.actor_name)}
                  </span>
                ) : null}
                <span className="truncate">
                  {ev.actor_name ? (
                    <>
                      <span className="text-foreground">{ev.actor_name}</span>
                      {" · "}
                    </>
                  ) : null}
                  {when}
                </span>
              </div>
            </li>
          );
        })}
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
  field: "copy" | "hashtags" | "cta" | "script" | "briefing" | "hook" | "headline";
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
    onError: (e: Error) => toast.error(describeError(e)),
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
    onError: (e: Error) => toast.error(describeError(e)),
  });
  const revoke = useMutation({
    mutationFn: (tokenId: string) => revokeTok({ data: { tokenId } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["approval-tokens", postId] }),
    onError: (e: Error) => toast.error(describeError(e)),
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
    <div className="space-y-1.5 rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs">
          <Link2 className="h-3.5 w-3.5" /> Aprovação externa
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Link2 className="mr-1 h-3 w-3" />
          )}
          Gerar link
        </Button>
      </div>
      {active.length > 0 ? (
        <ul className="space-y-1.5">
          {active.map((t) => {
            const url =
              typeof window !== "undefined"
                ? `${window.location.origin}/approval/${t.token}`
                : `/approval/${t.token}`;
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2 py-1 text-[11px]"
              >
                <code className="flex-1 truncate font-mono">{url}</code>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
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
                  className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                  onClick={() => revoke.mutate(t.id)}
                  title="Revogar"
                >
                  <ShieldX className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
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
  aiField?: "copy" | "hashtags" | "cta" | "hook" | "headline";
}> = [
  { key: "gancho", label: "HOOK", placeholder: "Primeira linha que segura o scroll…", rows: 2, aiField: "hook" },
  { key: "headline", label: "Headline", placeholder: "Ideia central em uma frase…", rows: 2, aiField: "headline" },
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
    <Tabs defaultValue={COPY_FIELDS[0].key} className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <TabsList className="h-10 w-full justify-start gap-1 rounded-none border-b border-border/60 bg-background/60 px-2">
        {COPY_FIELDS.map((f) => {
          const filled = sections[f.key].trim().length > 0;
          return (
            <TabsTrigger
              key={f.key}
              value={f.key}
              className="h-7 gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-widest"
            >
              {f.label}
              {filled ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {COPY_FIELDS.map((f) => (
        <TabsContent key={f.key} value={f.key} className="mt-0 px-3 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
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
        </TabsContent>
      ))}
    </Tabs>
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
  field: "copy" | "hashtags" | "cta" | "script" | "briefing" | "hook" | "headline";
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
    onError: (e: Error) => toast.error(describeError(e)),
  });
  const Icon = icon === "sparkles" ? Sparkles : Wand2;
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onClick={() => m.mutate()}
      disabled={m.isPending}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/60 text-muted-foreground transition hover:border-border hover:text-foreground disabled:opacity-60"
    >
      {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
    </button>
  );
}

// ---------------- Media helpers ----------------

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

// Produces a ~640px square-fit WebP thumbnail from an image or a video's
// first frame. Returns null on any failure (best-effort).
async function generateThumbnail(file: File): Promise<Blob | null> {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) return null;

  const targetMax = 640;

  const drawToCanvas = (
    source: HTMLImageElement | HTMLVideoElement,
    w: number,
    h: number,
  ): Promise<Blob | null> => {
    const scale = Math.min(1, targetMax / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(source, 0, 0, cw, ch);
    return new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.8),
    );
  };

  const url = URL.createObjectURL(file);
  try {
    if (isImage) {
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
      });
      return await drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    }
    // Video: capture the first frame
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        try {
          video.currentTime = Math.min(0.1, video.duration || 0.1);
        } catch {
          resolve();
        }
      };
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });
    return await drawToCanvas(video, video.videoWidth, video.videoHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------- Instagram-style carousel preview ----------------

type RefEntry = {
  path: string;
  name?: string;
  type?: string;
  size?: number;
  thumb_path?: string | null;
  pruned?: boolean | null;
};

function InstagramPreview({
  refs,
  urls,
  onRemove,
}: {
  refs: RefEntry[];
  urls: Record<string, string>;
  onRemove: (path: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  // MediaReferenceBlock is declared below to keep RefEntry type in scope.
  useEffect(() => {
    if (idx > refs.length - 1) setIdx(Math.max(0, refs.length - 1));
  }, [refs.length, idx]);

  if (refs.length === 0) return null;
  const current = refs[idx];
  const isVideo = (current.type ?? "").startsWith("video/");
  const originalUrl = urls[current.path];
  const thumbUrl = current.thumb_path ? urls[current.thumb_path] : null;
  const displayUrl =
    current.pruned && thumbUrl ? thumbUrl : originalUrl ?? thumbUrl ?? null;

  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-border/60 bg-foreground">
        <div className="relative aspect-square w-full">
          {displayUrl ? (
            isVideo && !current.pruned ? (
              <video
                key={current.path}
                src={displayUrl}
                controls
                playsInline
                className="h-full w-full object-cover"
                poster={thumbUrl ?? undefined}
              />
            ) : (
              <img
                src={displayUrl}
                alt={current.name ?? current.path}
                className="h-full w-full object-cover"
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}

          {isVideo && current.pruned ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/40">
              <Play className="h-10 w-10 text-background/90" />
            </div>
          ) : null}

          {refs.length > 1 ? (
            <>
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-foreground/70 px-2 py-0.5 text-[11px] font-medium text-background">
                <Images className="h-3 w-3" /> {idx + 1}/{refs.length}
              </span>
              {idx > 0 ? (
                <button
                  type="button"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md bg-foreground/60 p-1 text-background transition hover:bg-foreground/80"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
              {idx < refs.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setIdx((i) => Math.min(refs.length - 1, i + 1))
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-foreground/60 p-1 text-background transition hover:bg-foreground/80"
                  aria-label="Próximo"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            onClick={() => onRemove(current.path)}
            title="Remover mídia"
            className="absolute left-2 top-2 rounded-md bg-foreground/70 p-1 text-background transition hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {refs.length > 1 ? (
          <div className="flex items-center justify-center gap-1 bg-foreground/80 py-2">
            {refs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-4 bg-background" : "w-1.5 bg-background/40"
                }`}
                aria-label={`Ir para ${i + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {refs.length > 1 ? (
        <div className="mx-auto flex max-w-sm gap-1.5 overflow-x-auto pb-1">
          {refs.map((r, i) => {
            const t = r.thumb_path ? urls[r.thumb_path] : urls[r.path];
            const isVid = (r.type ?? "").startsWith("video/");
            return (
              <button
                key={r.path}
                type="button"
                onClick={() => setIdx(i)}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/60 transition ${
                  i === idx ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                }`}
              >
                {t ? (
                  <img src={t} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
                {isVid ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/30">
                    <Play className="h-3.5 w-3.5 text-background" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="text-center text-[11px] text-muted-foreground">
        {refs.length === 1
          ? "Preview estilo Instagram · adicione mais para virar Carrossel"
          : `Carrossel de ${refs.length} · arquivos originais mantidos por 30 dias após publicação`}
      </p>
    </div>
  );
}

function MediaReferenceBlock({
  refs,
  signedUrls,
  fileInput,
  onFiles,
  onRemove,
  onGenerate,
  uploading,
  generating,
}: {
  refs: RefEntry[];
  signedUrls: Record<string, string>;
  fileInput: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
  onRemove: (path: string) => void;
  onGenerate: () => void;
  uploading: boolean;
  generating: boolean;
}) {
  const [dragActive, setDragActive] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" /> Mídias de referência
        <span className="text-xs font-normal text-muted-foreground">
          (feeds, stories, moodboard)
        </span>
      </Label>
      <DashboardPanelSurface
        className={cn(
          "p-3 transition",
          dragActive && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
        )}
        onDragEnter={(e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer?.types?.includes("Files")) setDragActive(true);
        }}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer?.types?.includes("Files")) {
            e.dataTransfer.dropEffect = "copy";
            setDragActive(true);
          }
        }}
        onDragLeave={(e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
            /^(image|video)\//.test(f.type),
          );
          if (files.length > 0) onFiles(files);
        }}
      >
        {refs.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-6 text-xs transition",
              dragActive
                ? "border-primary/70 bg-primary/5 text-foreground"
                : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Upload className="h-4 w-4" />
            <span className="font-medium">Arraste e solte aqui</span>
            <span>
              ou clique para anexar. Ao inserir 2 ou mais, o post vira Carrossel.
            </span>
          </button>
        ) : (
          <InstagramPreview refs={refs} urls={signedUrls} onRemove={onRemove} />
        )}
        <div className="mt-2 flex justify-end">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            accept="image/*,video/*"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length > 0) onFiles(fs);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={generating}
              title="Gerar imagem de referência usando o hook, headline e copy"
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gerar com IA
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Anexar
            </Button>
          </div>
        </div>
      </DashboardPanelSurface>
    </div>
  );
}

