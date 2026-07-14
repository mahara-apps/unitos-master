import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, Sparkles, Upload, X, ImageIcon, FileText, RotateCcw, CheckCircle2, Link2, Copy as CopyIcon, ShieldX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  getPostDetailFn,
  updatePostFn,
  deletePostFn,
  uploadPostReferenceMediaFn,
  removePostReferenceMediaFn,
  signPostReferenceMediaFn,
} from "@/lib/content.functions";
import { reworkPostFn } from "@/lib/content.functions";
import { aiInlineGenerateFn } from "@/lib/copilot-inline.functions";
import {
  listApprovalTokensFn,
  createApprovalTokenFn,
  revokeApprovalTokenFn,
} from "@/lib/approval.functions";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  postId: string | null;
  onClose: () => void;
  boardQueryKey: readonly unknown[];
};

export function PostDetailDialog({ postId, onClose, boardQueryKey }: Props) {
  return (
    <Dialog open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        {postId ? (
          <PostDetailBody postId={postId} onClose={onClose} boardQueryKey={boardQueryKey} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PostDetailBody({
  postId,
  onClose,
  boardQueryKey,
}: {
  postId: string;
  onClose: () => void;
  boardQueryKey: readonly unknown[];
}) {
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

  const [title, setTitle] = useState(data.post.title);
  const [copy, setCopy] = useState(data.post.copy ?? "");
  const [scheduledAt, setScheduledAt] = useState<string>(
    data.post.scheduled_at ? data.post.scheduled_at.slice(0, 16) : "",
  );
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(data.post.title);
    setCopy(data.post.copy ?? "");
    setScheduledAt(data.post.scheduled_at ? data.post.scheduled_at.slice(0, 16) : "");
  }, [data.post.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refs = Array.isArray(data.post.reference_media) ? data.post.reference_media : [];
  const reviewStatus = data.post.review_status ?? "pending";
  const aiPhase = data.post.ai_phase ?? null;

  useEffect(() => {
    const paths = refs.map((r) => r.path).filter(Boolean);
    if (paths.length === 0) return;
    let cancelled = false;
    signRefs({ data: { paths } }).then((res) => {
      if (!cancelled) setSignedUrls(res.urls);
    });
    return () => { cancelled = true; };
  }, [refs.map((r) => r.path).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () =>
      updatePost({
        data: {
          postId,
          patch: {
            title: title.trim(),
            copy: copy.trim() || null,
            scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Post atualizado");
      qc.invalidateQueries({ queryKey: boardQueryKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deletePost({ data: { postId } }),
    onSuccess: () => {
      toast.success("Post excluído");
      qc.invalidateQueries({ queryKey: boardQueryKey });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rework = useMutation({
    mutationFn: (notes: string) => reworkPost({ data: { postId, notes } }),
    onSuccess: () => {
      toast.success("Post enviado para refação");
      qc.invalidateQueries({ queryKey: boardQueryKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveOnly = useMutation({
    mutationFn: () =>
      updatePost({ data: { postId, patch: { review_status: "approved" } } }),
    onSuccess: () => {
      toast.success("Post aprovado");
      qc.invalidateQueries({ queryKey: boardQueryKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      return uploadRef({
        data: { postId, filename: file.name, contentType: file.type || "application/octet-stream", base64 },
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
        data: { postId, patch: { review_status: "approved", title: title.trim(), copy: copy.trim() || null } },
      });
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/jobs/post-phase2", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ postId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Fase 2 iniciada em segundo plano");
      qc.invalidateQueries({ queryKey: boardQueryKey });
      qc.invalidateQueries({ queryKey: ["post-detail", postId] });
      qc.invalidateQueries({ queryKey: ["ai-jobs", "active"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aprovar");
    } finally {
      setApproving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-medium">
          Detalhes do post
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
        </DialogTitle>
        <DialogDescription>Edite copy, agendamento e responsáveis.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pd-title">Título</Label>
          <Input id="pd-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="pd-copy">Copy</Label>
            <AiFieldButton
              postId={postId}
              field="copy"
              label="Gerar copy"
              onText={(t) => setCopy(t)}
            />
          </div>
          <Textarea
            id="pd-copy"
            rows={6}
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            placeholder="Escreva o texto do post…"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            <AiFieldButton
              postId={postId}
              field="hashtags"
              label="Hashtags"
              size="xs"
              onText={(t) => setCopy((prev) => `${prev.trimEnd()}\n\n${t}`.trim())}
            />
            <AiFieldButton
              postId={postId}
              field="cta"
              label="CTA"
              size="xs"
              onText={(t) => setCopy((prev) => `${prev.trimEnd()}\n\n${t}`.trim())}
            />
            <AiFieldButton
              postId={postId}
              field="script"
              label="Roteiro"
              size="xs"
              onText={(t) => setCopy((prev) => `${prev.trimEnd()}\n\n${t}`.trim())}
            />
          </div>
        </div>
        {data.post.design_brief ? (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Briefing visual</Label>
            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
              {data.post.design_brief}
            </div>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> Mídias de referência
            <span className="text-xs font-normal text-muted-foreground">(feeds, stories, moodboard)</span>
          </Label>
          <div className="rounded-md border p-2">
            {refs.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                Anexe imagens que a IA usará como referência visual na Fase 2.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {refs.map((r) => {
                  const url = signedUrls[r.path];
                  const isImg = (r.type ?? "").startsWith("image/");
                  return (
                    <div key={r.path} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                      {isImg && url ? (
                        <img src={url} alt={r.name ?? r.path} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center p-1 text-center">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                          <span className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{r.name}</span>
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
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Anexar
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-sched">Agendado para</Label>
          <Input
            id="pd-sched"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <Separator />
        <ApprovalLinkSection postId={postId} />
        <Separator />
        <Timeline items={data.timeline} />
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm("Excluir este post?")) remove.mutate();
          }}
          disabled={remove.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const notes = window.prompt("Descreva o ajuste solicitado (opcional):") ?? "";
              rework.mutate(notes);
            }}
            disabled={rework.isPending}
            title="Reabrir para refação"
          >
            {rework.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Refazer
          </Button>
          <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
          {reviewStatus === "pending" && aiPhase === "idea" ? (
            <Button onClick={handleApproveAndGenerate} disabled={approving}>
              {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Aprovar & gerar copy
            </Button>
          ) : reviewStatus !== "approved" ? (
            <Button onClick={() => approveOnly.mutate()} disabled={approveOnly.isPending}>
              {approveOnly.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Aprovar
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </>
  );
}

function Timeline({
  items,
}: {
  items: { id: string; verb: string; created_at: string; payload: string | null }[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-tokens", postId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const active = (q.data ?? []).filter(
    (t) =>
      !t.revoked_at &&
      (!t.expires_at || new Date(t.expires_at).getTime() > Date.now()),
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
          Nenhum link ativo. Gere um link seguro para envio ao cliente aprovar sem login.
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