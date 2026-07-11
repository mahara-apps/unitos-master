import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
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
import { getPostDetailFn, updatePostFn, deletePostFn } from "@/lib/content.functions";

type Props = {
  postId: string | null;
  onClose: () => void;
  boardQueryKey: readonly unknown[];
};

export function PostDetailDialog({ postId, onClose, boardQueryKey }: Props) {
  return (
    <Dialog open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
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

  const { data } = useSuspenseQuery({
    queryKey: ["post-detail", postId],
    queryFn: () => getDetail({ data: { postId } }),
  });

  const [title, setTitle] = useState(data.post.title);
  const [copy, setCopy] = useState(data.post.copy ?? "");
  const [scheduledAt, setScheduledAt] = useState<string>(
    data.post.scheduled_at ? data.post.scheduled_at.slice(0, 16) : "",
  );

  useEffect(() => {
    setTitle(data.post.title);
    setCopy(data.post.copy ?? "");
    setScheduledAt(data.post.scheduled_at ? data.post.scheduled_at.slice(0, 16) : "");
  }, [data.post.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-medium">Detalhes do post</DialogTitle>
        <DialogDescription>Edite copy, agendamento e responsáveis.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pd-title">Título</Label>
          <Input id="pd-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-copy">Copy</Label>
          <Textarea
            id="pd-copy"
            rows={6}
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            placeholder="Escreva o texto do post…"
          />
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
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar alterações
          </Button>
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