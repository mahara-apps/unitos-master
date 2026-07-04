import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Wand2, ImageIcon, Loader2, Upload } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { COLUMNS, type Platform, type Post, type PostStatus } from "./types";
import { updatePost } from "@/lib/api/posts";
import { generateCopy, generateImage } from "@/lib/api/ai";
import { PlatformIcon, platformLabel } from "./platform-icon";

interface Props {
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLATFORMS: Platform[] = ["instagram", "linkedin", "twitter", "tiktok"];

export function PostEditorSheet({ post, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Post | null>(post);
  const [genCopy, setGenCopy] = useState(false);
  const [genImg, setGenImg] = useState(false);

  useEffect(() => {
    setDraft(post);
  }, [post]);

  const save = useMutation({
    mutationFn: updatePost,
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["posts", next.campaignId] });
      toast.success("Post atualizado");
      onOpenChange(false);
    },
  });

  if (!draft) return null;

  async function handleGenerateCopy() {
    if (!draft) return;
    setGenCopy(true);
    try {
      const copy = await generateCopy(draft.title || draft.copy);
      setDraft({ ...draft, copy });
      toast.success("Copy gerada com IA");
    } finally {
      setGenCopy(false);
    }
  }

  async function handleGenerateImage() {
    if (!draft) return;
    setGenImg(true);
    try {
      const url = await generateImage(draft.title);
      setDraft({ ...draft, imageUrl: url });
      toast.success("Imagem gerada com IA");
    } finally {
      setGenImg(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-border/60 bg-background/95 backdrop-blur-xl sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>Editar post</SheetTitle>
          <SheetDescription>
            Ajuste conteúdo, imagem e status. Use a IA para acelerar.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plataforma</Label>
              <Select
                value={draft.platform}
                onValueChange={(v) => setDraft({ ...draft, platform: v as Platform })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <PlatformIcon platform={p} />
                        {platformLabel(p)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft({ ...draft, status: v as PostStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Ex.: Anúncio do novo módulo de IA"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="copy">Copy</Label>
              <Button
                type="button"
                size="sm"
                variant="ai"
                onClick={handleGenerateCopy}
                disabled={genCopy}
              >
                {genCopy ? (
                  <>
                    <Loader2 className="animate-spin" /> Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles /> Gerar Copy com IA
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="copy"
              rows={7}
              value={draft.copy}
              onChange={(e) => setDraft({ ...draft, copy: e.target.value })}
              placeholder="Escreva a copy do post ou gere com IA..."
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Imagem</Label>
              <Button
                type="button"
                size="sm"
                variant="ai"
                onClick={handleGenerateImage}
                disabled={genImg}
              >
                {genImg ? (
                  <>
                    <Loader2 className="animate-spin" /> Gerando...
                  </>
                ) : (
                  <>
                    <Wand2 /> Gerar Imagem com IA
                  </>
                )}
              </Button>
            </div>

            {draft.imageUrl ? (
              <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted">
                <img
                  src={draft.imageUrl}
                  alt="Prévia"
                  className="aspect-video w-full object-cover"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute right-2 top-2"
                  onClick={() => setDraft({ ...draft, imageUrl: undefined })}
                >
                  Remover
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                <Upload className="h-5 w-5" />
                Enviar imagem ou gerar com IA
                <ImageIcon className="hidden" />
              </button>
            )}
          </div>
        </div>

        <SheetFooter className="mt-8 gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate({ ...draft, updatedAt: new Date().toISOString() })}
            disabled={save.isPending}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}