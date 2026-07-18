import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  ImagePlus,
  Send,
  CalendarClock,
  Check,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { listBrandChannelsFn } from "@/lib/social-connections.functions";
import {
  listBrandMediaFn,
  signBrandMediaFn,
  type BrandMediaAsset,
} from "@/lib/brand-media.functions";
import { publishNow, schedulePost } from "@/lib/meta/publishing.functions";

type Mode = "now" | "schedule";

export function ComposerDialog({
  open,
  onOpenChange,
  brandId,
  clientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  clientId?: string | null;
}) {
  const listChannels = useServerFn(listBrandChannelsFn);
  const listMedia = useServerFn(listBrandMediaFn);
  const signMedia = useServerFn(signBrandMediaFn);
  const publishNowFn = useServerFn(publishNow);
  const schedulePostFn = useServerFn(schedulePost);
  const qc = useQueryClient();

  const channelsQ = useQuery({
    queryKey: ["brand-channels", brandId],
    queryFn: () => listChannels({ data: { brandId } }),
    enabled: open,
  });
  const mediaQ = useQuery({
    queryKey: ["brand-media", brandId, "picker"],
    queryFn: () => listMedia({ data: { brandId, limit: 60, kind: "image" } }),
    enabled: open,
  });

  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<BrandMediaAsset | null>(null);
  const [mode, setMode] = useState<Mode>("now");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const channels = channelsQ.data ?? [];
  const media = mediaQ.data ?? [];

  const canSubmit = useMemo(() => {
    if (!selectedChannels.size) return false;
    if (mode === "schedule" && !scheduleAt) return false;
    // IG requer imagem
    const needsImage = channels.some(
      (c) => selectedChannels.has(channelKey(c)) && c.network === "instagram",
    );
    if (needsImage && !selectedMedia) return false;
    if (!caption.trim() && !selectedMedia) return false;
    return true;
  }, [selectedChannels, caption, selectedMedia, mode, scheduleAt, channels]);

  function toggleChannel(key: string) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function reset() {
    setSelectedChannels(new Set());
    setCaption("");
    setSelectedMedia(null);
    setMode("now");
    setScheduleAt("");
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (selectedMedia) {
        const { url } = await signMedia({
          data: {
            brandId,
            storagePath: selectedMedia.storagePath,
            expiresIn: 60 * 60 * 24,
          },
        });
        imageUrl = url;
      }

      const targets = channels.filter((c) => selectedChannels.has(channelKey(c)));
      const results = await Promise.allSettled(
        targets.map((c) => {
          const payload = {
            brandId,
            clientId: clientId ?? undefined,
            connectionId: c.connectionId,
            placement: c.placement as any,
            caption: caption.trim() || undefined,
            hashtags: [],
            mentions: [],
            media: { imageUrl },
          };
          return mode === "now"
            ? publishNowFn({ data: payload })
            : schedulePostFn({
                data: { ...payload, scheduledAt: new Date(scheduleAt).toISOString() },
              });
        }),
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      if (ok > 0) {
        toast.success(
          mode === "now"
            ? `Publicado em ${ok} canal(is)`
            : `Agendado em ${ok} canal(is)`,
        );
      }
      if (failed > 0) {
        const reasons = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => (r.reason as Error).message)
          .join(" · ");
        toast.error(`${failed} falharam: ${reasons}`);
      }

      qc.invalidateQueries({ queryKey: ["publications", brandId] });
      if (failed === 0) {
        reset();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Novo conteúdo</DialogTitle>
          <DialogDescription>
            Publique ou agende em uma ou mais contas conectadas desta marca.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                Canais
              </Label>
              {channelsQ.isLoading ? (
                <div className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Carregando…</div>
              ) : channels.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
                  Nenhum canal conectado. Vá em <b>Integrações</b> para conectar Instagram/Facebook.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {channels.map((c) => {
                    const key = channelKey(c);
                    const active = selectedChannels.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleChannel(key)}
                        className={cn(
                          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 hover:bg-muted",
                        )}
                      >
                        <Avatar className="h-5 w-5">
                          {c.avatarUrl ? (
                            <AvatarImage src={c.avatarUrl} />
                          ) : (
                            <AvatarFallback className="text-[9px]">
                              {c.network.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <span>{c.label}</span>
                        <Badge variant="outline" className="h-4 px-1 text-[9px]">
                          {c.network}
                        </Badge>
                        {active ? <Check className="h-3 w-3" /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="caption" className="mb-2 block text-xs font-medium text-muted-foreground">
                Texto
              </Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                maxLength={2200}
                placeholder="Escreva a legenda…"
              />
              <div className="mt-1 text-right text-[10px] text-muted-foreground">
                {caption.length}/2200
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                Publicação
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={mode === "now" ? "default" : "outline"}
                  onClick={() => setMode("now")}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Publicar agora
                </Button>
                <Button
                  size="sm"
                  variant={mode === "schedule" ? "default" : "outline"}
                  onClick={() => setMode("schedule")}
                >
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Agendar
                </Button>
                {mode === "schedule" ? (
                  <Input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="max-w-[220px]"
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs font-medium text-muted-foreground">
              Mídia
            </Label>
            {selectedMedia ? (
              <div className="relative overflow-hidden rounded-md border border-border/60">
                {selectedMedia.publicUrl ? (
                  <img
                    src={selectedMedia.publicUrl}
                    alt={selectedMedia.name}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-muted text-muted-foreground">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute right-1.5 top-1.5 h-6 w-6"
                  onClick={() => setSelectedMedia(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
                <div className="truncate px-2 py-1.5 text-[11px]">{selectedMedia.name}</div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border/60 p-3">
                <div className="mb-2 text-[11px] text-muted-foreground">
                  Escolha uma imagem da biblioteca:
                </div>
                <ScrollArea className="h-56">
                  {mediaQ.isLoading ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Carregando…
                    </div>
                  ) : media.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      Nenhuma mídia — envie arquivos na aba <b>Biblioteca</b>.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 pr-2">
                      {media.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMedia(m)}
                          className="group aspect-square overflow-hidden rounded border border-border/60 hover:ring-2 hover:ring-primary"
                          title={m.name}
                        >
                          {m.publicUrl ? (
                            <img
                              src={m.publicUrl}
                              alt={m.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full bg-muted" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
        </div>

        <Separator />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : mode === "now" ? (
              <Send className="mr-1.5 h-4 w-4" />
            ) : (
              <CalendarClock className="mr-1.5 h-4 w-4" />
            )}
            {mode === "now" ? "Publicar agora" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function channelKey(c: { connectionId: string; placement: string }) {
  return `${c.connectionId}:${c.placement}`;
}