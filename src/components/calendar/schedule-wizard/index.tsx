import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Send,
  Sparkles,
  UploadCloud,
  Video as VideoIcon,
  X,
  Hash,
  MessageCircle,
  Link2,
  MapPin,
  AlertTriangle,
  Heart,
  MessageSquare,
  Bookmark,
  Share,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import {
  FORMATS_BY_CHANNEL,
  FORMAT_LABEL,
  tightestCaptionLimit,
  type PlacementFormat,
  type MediaKind,
  inferMediaKind,
  isFormatCompatibleWithMedia,
  formatIncompatibilityReason,
  suggestFormatsForMedia,
} from "@/lib/scheduling-formats";
import { SOCIAL_CHANNELS, type SocialChannel } from "@/lib/social-core/capabilities";
import {
  listClientSocialConnectionsFn,
  saveScheduledPostFn,
  type WizardConnection,
} from "@/lib/scheduling-wizard.functions";
import {
  listBrandMediaFn,
  registerBrandMediaFn,
  type BrandMediaAsset,
} from "@/lib/brand-media.functions";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

function slugifyMediaName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export type WizardSeed = {
  postId?: string;
  title?: string;
  copy?: string;
  coverUrl?: string | null;
  targetConnectionIds?: string[];
};

type Pair = { channel: SocialChannel; format: PlacementFormat; connectionId: string };

export function ScheduleWizard({
  open,
  onOpenChange,
  brandId,
  clientId,
  seed,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  clientId: string;
  seed?: WizardSeed | null;
  defaultDate?: Date | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const listConnections = useServerFn(listClientSocialConnectionsFn);
  const listMedia = useServerFn(listBrandMediaFn);
  const saveFn = useServerFn(saveScheduledPostFn);
  const registerMedia = useServerFn(registerBrandMediaFn);

  const [title, setTitle] = useState("");
  const [copy, setCopy] = useState("");
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<BrandMediaAsset[]>([]);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [locationName, setLocationName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState<null | "draft" | "publish" | "schedule" | "save_draft">(null);
  const [previewChannel, setPreviewChannel] = useState<SocialChannel>("instagram");

  const uploadRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    // Só reseta na transição fechado → aberto para garantir tela limpa
    // sempre que o wizard reabre (Novo, editar rascunho, etc).
    if (open && !wasOpenRef.current) {
      setTitle(seed?.title ?? "");
      setCopy(seed?.copy ?? "");
      setPairs([]);
      setSelectedMedia([]);
      setHashtags([]);
      setTagInput("");
      setFirstComment("");
      setLinkUrl("");
      setLocationName("");
      setDragActive(false);
      setUploading(false);
      setSubmitting(null);
      setPreviewChannel("instagram");
      if (uploadRef.current) uploadRef.current.value = "";
      const base = defaultDate
        ? new Date(defaultDate)
        : new Date(Date.now() + 60 * 60 * 1000);
      base.setSeconds(0, 0);
      setScheduleDate(fmtDate(base));
      setScheduleTime(fmtTime(base));
    }
    wasOpenRef.current = open;
  }, [open, seed, defaultDate]);

  const connectionsQ = useQuery({
    enabled: open,
    queryKey: ["wizard-connections", brandId, clientId],
    queryFn: () => listConnections({ data: { brandId, clientId } }),
  });

  // Pré-preenche destinos a partir das conexões escolhidas na tela de Conteúdo
  // (Kanban → target_connection_ids), quando o wizard abre com um seed.
  useEffect(() => {
    if (!open) return;
    const ids = seed?.targetConnectionIds ?? [];
    if (ids.length === 0) return;
    const conns = connectionsQ.data ?? [];
    if (conns.length === 0) return;
    setPairs((prev) => {
      if (prev.length > 0) return prev;
      const next: Pair[] = [];
      for (const id of ids) {
        const c = conns.find((x) => x.connectionId === id);
        if (!c) continue;
        next.push({
          channel: c.channel as SocialChannel,
          format: "Feed" as PlacementFormat,
          connectionId: id,
        });
      }
      return next;
    });
  }, [open, seed?.targetConnectionIds, connectionsQ.data]);

  const mediaQ = useQuery({
    enabled: open,
    queryKey: ["wizard-media", brandId, "all"],
    queryFn: () => listMedia({ data: { brandId, limit: 60 } }),
  });

  const connByChannel = useMemo(() => {
    const map = new Map<SocialChannel, WizardConnection>();
    (connectionsQ.data ?? []).forEach((c) => {
      if (!map.has(c.channel as SocialChannel)) {
        map.set(c.channel as SocialChannel, c);
      }
    });
    return map;
  }, [connectionsQ.data]);

  const mediaKind: MediaKind = useMemo(() => inferMediaKind(selectedMedia), [selectedMedia]);

  useEffect(() => {
    setPairs((prev) => prev.filter((p) => isFormatCompatibleWithMedia(p.format, mediaKind)));
  }, [mediaKind]);

  // Ensure preview channel is one we have selected — else fall back to first pair
  useEffect(() => {
    if (!pairs.length) return;
    if (!pairs.some((p) => p.channel === previewChannel)) {
      setPreviewChannel(pairs[0].channel);
    }
  }, [pairs, previewChannel]);

  const captionLimit = useMemo(
    () => tightestCaptionLimit(pairs.map((p) => p.channel)),
    [pairs],
  );

  const overLimit = copy.length > captionLimit;
  const canSubmit = pairs.length > 0 && !overLimit && !!title.trim();

  function togglePair(channel: SocialChannel, format: PlacementFormat) {
    const conn = connByChannel.get(channel);
    if (!conn) {
      toast.error("Conecte esta conta em Conexões primeiro.");
      return;
    }
    if (!isFormatCompatibleWithMedia(format, mediaKind)) {
      toast.error(
        formatIncompatibilityReason(format, mediaKind) ??
          "Formato incompatível com a mídia selecionada.",
      );
      return;
    }
    setPairs((prev) => {
      const exists = prev.find((p) => p.channel === channel && p.format === format);
      if (exists) return prev.filter((p) => !(p.channel === channel && p.format === format));
      return [...prev, { channel, format, connectionId: conn.connectionId }];
    });
  }

  function autoSuggestPairs() {
    const suggested: Pair[] = [];
    for (const [channel, conn] of connByChannel.entries()) {
      const [fmt] = suggestFormatsForMedia(channel, mediaKind);
      if (fmt) suggested.push({ channel, format: fmt, connectionId: conn.connectionId });
    }
    if (suggested.length) {
      setPairs(suggested);
      toast.success(`Sugestão aplicada em ${suggested.length} canal(is)`);
    } else {
      toast.error("Nenhuma sugestão disponível — conecte contas ou adicione mídia.");
    }
  }

  const handleUpload = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const arr = Array.from(files);
      if (!arr.length) return;
      setUploading(true);
      const uploaded: BrandMediaAsset[] = [];
      try {
        for (const file of arr) {
          const path = `${brandId}/${crypto.randomUUID()}-${slugifyMediaName(file.name)}`;
          const { error: upErr } = await supabase.storage
            .from("brand-media")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw new Error(upErr.message);
          const asset = await registerMedia({
            data: {
              brandId,
              storagePath: path,
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              tags: [],
            },
          });
          uploaded.push(asset);
        }
        setSelectedMedia((prev) => {
          const merged = [...prev];
          for (const a of uploaded) if (!merged.find((x) => x.id === a.id)) merged.push(a);
          return merged;
        });
        qc.invalidateQueries({ queryKey: ["wizard-media", brandId, "all"] });
        qc.invalidateQueries({ queryKey: ["brand-media", brandId] });
        toast.success(`${uploaded.length} arquivo(s) enviados`);
      } catch (e) {
        toast.error(describeError(e));
      } finally {
        setUploading(false);
        if (uploadRef.current) uploadRef.current.value = "";
      }
    },
    [brandId, qc, registerMedia],
  );

  function commitTag() {
    const raw = tagInput.trim().replace(/^#/, "");
    if (!raw) return;
    if (hashtags.includes(raw)) {
      setTagInput("");
      return;
    }
    setHashtags([...hashtags, raw]);
    setTagInput("");
  }

  function toggleMedia(m: BrandMediaAsset) {
    setSelectedMedia((prev) =>
      prev.find((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m],
    );
  }

  async function persist(action: "draft" | "publish" | "schedule" | "save_draft") {
    if (action !== "save_draft" && !pairs.length) {
      toast.error("Selecione pelo menos um canal.");
      return;
    }
    if (action === "schedule" && (!scheduleDate || !scheduleTime)) {
      toast.error("Defina data e horário para agendar.");
      return;
    }
    setSubmitting(action);
    try {
      const scheduledIso =
        action === "schedule" && scheduleDate && scheduleTime
          ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
          : null;
      const res: any = await saveFn({
        data: {
          postId: seed?.postId ?? null,
          brandId,
          clientId,
          title: title.trim() || "Publicação sem título",
          copy,
          mediaPaths: selectedMedia.map((m) => m.storagePath),
          hashtags,
          firstComment: firstComment.trim() || null,
          linkUrl: linkUrl.trim() || null,
          locationName: locationName.trim() || null,
          destinations: pairs.map((p) => ({
            connectionId: p.connectionId,
            channel: p.channel,
            format: p.format,
          })),
          scheduledAt: scheduledIso,
          action,
        },
      });
      if (action === "publish") {
        const okCount = res?.published ?? 0;
        const failed = (res?.results ?? []).filter((r: any) => !r.ok);
        if (okCount > 0) toast.success(`Publicado em ${okCount} canal(is)`);
        if (failed.length) {
          toast.error(
            `Falha em ${failed.length}: ${failed
              .map((f: any) => `${f.channel}/${f.format} — ${f.error}`)
              .join(" · ")}`,
          );
        }
      } else if (action === "save_draft") {
        toast.success("Rascunho salvo. Você pode retomar depois.");
      } else {
        toast.success(action === "draft" ? "Enviado para aprovação" : "Agendamento criado");
      }
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["pending-schedule"] });
      qc.invalidateQueries({ queryKey: ["wizard-drafts"] });
      onSaved?.();
      if (action !== "publish" || (res?.published ?? 0) > 0) onOpenChange(false);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setSubmitting(null);
    }
  }

  const primaryConn = connByChannel.get(previewChannel) ?? connectionsQ.data?.[0];
  const previewMedia = selectedMedia[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 !p-0 sm:max-w-none"
      >
        <VisuallyHidden>
          <SheetTitle>Novo agendamento</SheetTitle>
          <SheetDescription>Componha e agende sua publicação</SheetDescription>
        </VisuallyHidden>

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight">
                Novo agendamento
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {pairs.length
                  ? `${pairs.length} destino(s) · limite ${captionLimit} caracteres`
                  : "Selecione canais, escreva a legenda e agende"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pr-8">
            {pairs.length ? (
              <Badge variant="secondary" className="text-[10px]">
                {pairs.length} destino(s)
              </Badge>
            ) : null}
          </div>
        </header>

        {/* Body — 3 columns */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* Column 1 — Context & Copy */}
            <ScrollArea className="h-full border-b border-border/60 lg:border-b-0 lg:border-r">
              <div className="space-y-5 p-6">
                <SectionTitle index={1} title="Contexto & Copy" />

                {/* Channels */}
                <div className="space-y-2">
                  <Label className="text-xs">Canais de publicação</Label>
                  {connectionsQ.isLoading ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando conexões…
                    </div>
                  ) : (connectionsQ.data ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
                      <p className="text-xs font-medium">Nenhuma rede conectada.</p>
                      <Button asChild size="sm" variant="outline" className="mt-3 h-7 text-[11px]">
                        <Link to="/connections">Ir para Conexões</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {SOCIAL_CHANNELS.map((channel) => {
                        const conn = connByChannel.get(channel);
                        const formats = FORMATS_BY_CHANNEL[channel] ?? [];
                        if (!conn) return null;
                        return (
                          <div
                            key={channel}
                            className="rounded-lg border border-border/60 bg-card/30 p-3"
                          >
                            <div className="mb-2 flex min-w-0 items-center gap-2">
                              <Avatar className="h-6 w-6 shrink-0">
                                <AvatarImage src={conn.avatarUrl ?? undefined} />
                                <AvatarFallback className="text-[9px] uppercase">
                                  {channel.slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-semibold capitalize">
                                  {channel}
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">
                                  {conn.handle ? `@${conn.handle}` : conn.accountLabel}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {formats.map((f) => {
                                const selected = pairs.some(
                                  (p) => p.channel === channel && p.format === f,
                                );
                                const compatible = isFormatCompatibleWithMedia(f, mediaKind);
                                const reason = formatIncompatibilityReason(f, mediaKind);
                                return (
                                  <button
                                    key={f}
                                    type="button"
                                    disabled={!compatible}
                                    title={reason ?? `${FORMAT_LABEL[f]} disponível`}
                                    onClick={() => togglePair(channel, f)}
                                    className={cn(
                                      "rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors",
                                      selected
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border/60 hover:bg-muted",
                                      !compatible &&
                                        "cursor-not-allowed opacity-40 hover:bg-transparent",
                                    )}
                                  >
                                    {FORMAT_LABEL[f]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {(connectionsQ.data ?? []).length > 0 && mediaKind !== "none" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-full text-[11px]"
                          onClick={autoSuggestPairs}
                        >
                          <Sparkles className="mr-1.5 h-3 w-3" /> Sugerir formatos automaticamente
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-title" className="text-xs">
                    Título interno
                  </Label>
                  <Input
                    id="wiz-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: Lançamento de coleção — reels"
                  />
                </div>

                {/* Copy */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="wiz-copy" className="text-xs">
                      Legenda
                    </Label>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10.5px] tabular-nums",
                          overLimit ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {copy.length}/{captionLimit}
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted"
                        title="Criar legenda com IA (em breve)"
                        onClick={() => toast.info("Criar legenda com IA — em breve.")}
                      >
                        <Sparkles className="h-3 w-3" /> IA
                      </button>
                    </div>
                  </div>
                  <Textarea
                    id="wiz-copy"
                    value={copy}
                    onChange={(e) => setCopy(e.target.value)}
                    rows={8}
                    placeholder="Escreva a legenda. O contador respeita a rede mais restritiva selecionada."
                    className={cn(overLimit && "border-destructive focus-visible:ring-destructive")}
                  />
                </div>

                {/* Hashtags */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Hash className="h-3 w-3" /> Hashtags
                  </Label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 p-2">
                    {hashtags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] text-primary"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => setHashtags(hashtags.filter((x) => x !== t))}
                          className="text-primary/70 hover:text-primary"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          commitTag();
                        } else if (e.key === "Backspace" && !tagInput && hashtags.length) {
                          setHashtags(hashtags.slice(0, -1));
                        }
                      }}
                      onBlur={commitTag}
                      placeholder={hashtags.length ? "" : "marketing, unitos, launch…"}
                      className="min-w-[120px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                {/* Extras */}
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="wiz-first-comment"
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <MessageCircle className="h-3 w-3" /> Primeiro comentário
                      <span className="text-[10px] font-normal text-muted-foreground">Instagram</span>
                    </Label>
                    <Textarea
                      id="wiz-first-comment"
                      rows={2}
                      value={firstComment}
                      onChange={(e) => setFirstComment(e.target.value)}
                      placeholder="Ex.: pool de hashtags fixado."
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz-link" className="flex items-center gap-1.5 text-xs">
                        <Link2 className="h-3 w-3" /> Link
                      </Label>
                      <Input
                        id="wiz-link"
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://…"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz-location" className="flex items-center gap-1.5 text-xs">
                        <MapPin className="h-3 w-3" /> Local
                      </Label>
                      <Input
                        id="wiz-location"
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        placeholder="Ex.: São Paulo, SP"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* Column 2 — Media & Schedule */}
            <ScrollArea className="h-full border-b border-border/60 lg:border-b-0 lg:border-r">
              <div className="space-y-5 p-6">
                <SectionTitle index={2} title="Mídia & Agendamento" />

                {/* Drag & drop */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    handleUpload(e.dataTransfer.files);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-border/70 bg-muted/20 hover:bg-muted/40",
                  )}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-background shadow-sm">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-xs font-medium">
                    {uploading ? "Enviando…" : "Arraste e solte arquivos aqui"}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    Imagens ou vídeos até 100MB
                  </div>
                  <input
                    ref={uploadRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 h-7 text-[11px]"
                    disabled={uploading}
                    onClick={() => uploadRef.current?.click()}
                  >
                    Selecionar do computador
                  </Button>
                </div>

                {mediaKind === "mixed" ? (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                    <span>
                      Remova imagens OU vídeos — apenas um tipo é permitido por publicação.
                    </span>
                  </div>
                ) : null}

                {/* Selected media strip */}
                {selectedMedia.length ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Selecionadas ({selectedMedia.length})</Label>
                      <button
                        type="button"
                        onClick={() => setSelectedMedia([])}
                        className="text-[10.5px] text-muted-foreground hover:text-destructive"
                      >
                        Limpar
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMedia.map((m) => (
                        <div
                          key={m.id}
                          className="relative h-16 w-16 overflow-hidden rounded-md border border-border/60"
                        >
                          {m.kind === "video" && m.publicUrl ? (
                            <video
                              src={m.publicUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : m.publicUrl ? (
                            <img
                              src={m.publicUrl}
                              alt={m.name}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                          <button
                            type="button"
                            onClick={() => toggleMedia(m)}
                            className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white hover:bg-destructive"
                            title="Remover"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Library */}
                <div className="space-y-2">
                  <Label className="text-xs">Biblioteca do cliente</Label>
                  {mediaQ.isLoading ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando mídias…
                    </div>
                  ) : (mediaQ.data ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
                      <ImageIcon className="mx-auto mb-1.5 h-4 w-4" />
                      Biblioteca vazia — envie seu primeiro arquivo acima.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {(mediaQ.data ?? []).map((m) => {
                        const selected = selectedMedia.some((x) => x.id === m.id);
                        const isVideo = m.kind === "video";
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMedia(m)}
                            className={cn(
                              "relative aspect-square overflow-hidden rounded-md border-2 bg-muted transition-all",
                              selected
                                ? "border-primary"
                                : "border-transparent hover:border-border",
                            )}
                          >
                            {isVideo && m.publicUrl ? (
                              <video
                                src={m.publicUrl}
                                className="h-full w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : m.publicUrl ? (
                              <img
                                src={m.publicUrl}
                                alt={m.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                {m.kind}
                              </div>
                            )}
                            {isVideo ? (
                              <span className="absolute bottom-0.5 left-0.5 inline-flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white">
                                <VideoIcon className="h-2.5 w-2.5" />
                              </span>
                            ) : null}
                            {selected ? (
                              <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                                <Check className="h-2.5 w-2.5" />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Schedule */}
                <div className="space-y-2">
                  <Label className="text-xs">Data & horário</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={scheduleDate}
                      min={fmtDate(new Date())}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                  </div>
                  <p className="text-[10.5px] text-muted-foreground">
                    Fuso: {tzLabel()}. Use o botão “Publicar agora” para envio imediato.
                  </p>
                </div>
              </div>
            </ScrollArea>

            {/* Column 3 — Live Preview */}
            <div className="flex h-full min-h-0 flex-col bg-muted/30">
              <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-5 py-3">
                <SectionTitle index={3} title="Preview" compact />
                {pairs.length ? (
                  <div className="flex items-center gap-1">
                    {Array.from(new Set(pairs.map((p) => p.channel))).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setPreviewChannel(ch)}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10.5px] capitalize transition-colors",
                          previewChannel === ch
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex items-start justify-center p-6">
                  <PostPreview
                    channel={previewChannel}
                    handle={primaryConn?.handle ?? primaryConn?.accountLabel ?? "sua_marca"}
                    avatarUrl={primaryConn?.avatarUrl ?? null}
                    copy={copy}
                    hashtags={hashtags}
                    media={previewMedia}
                    location={locationName}
                  />
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Sticky bottom action bar */}
        <footer className="relative flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
          {submitting ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/10">
              <div className="h-full w-1/3 animate-[wizard-progress_1.2s_ease-in-out_infinite] bg-primary" />
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            {submitting ? (
              <span className="flex items-center gap-2 text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {submitting === "publish"
                  ? `Publicando em ${pairs.length} canal(is)…`
                  : submitting === "schedule"
                    ? "Agendando publicação…"
                    : submitting === "save_draft"
                      ? "Salvando rascunho…"
                      : "Enviando para aprovação…"}
              </span>
            ) : pairs.length ? (
              <>
                <span className="tabular-nums">{pairs.length} destino(s)</span>
                <span>·</span>
                <span
                  className={cn(
                    "tabular-nums",
                    overLimit ? "text-destructive" : undefined,
                  )}
                >
                  {copy.length}/{captionLimit}
                </span>
                {selectedMedia.length ? (
                  <>
                    <span>·</span>
                    <span>{selectedMedia.length} mídia(s)</span>
                  </>
                ) : null}
              </>
            ) : (
              <span>Selecione ao menos um canal para habilitar as ações.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!!submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!submitting}
              onClick={() => persist("save_draft")}
              title="Salvar como rascunho para continuar depois"
            >
              {submitting === "save_draft" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Salvar rascunho
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canSubmit || !!submitting}
              onClick={() => persist("draft")}
            >
              {submitting === "draft" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Enviar para aprovação
            </Button>

            <div className="inline-flex overflow-hidden rounded-md">
              <Button
                size="sm"
                className="rounded-r-none"
                disabled={!canSubmit || !!submitting}
                onClick={() => persist("schedule")}
              >
                {submitting === "schedule" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                )}
                Agendar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-l-none border-l border-primary-foreground/20 px-2"
                    disabled={!canSubmit || !!submitting}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => persist("publish")}
                    disabled={!!submitting}
                  >
                    <Send className="mr-2 h-3.5 w-3.5" /> Publicar agora
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => persist("schedule")}
                    disabled={!!submitting}
                  >
                    <CalendarClock className="mr-2 h-3.5 w-3.5" /> Agendar para depois
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SectionTitle({
  index,
  title,
  compact,
}: {
  index: number;
  title: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "grid place-items-center rounded-full bg-primary/10 text-[10px] font-bold tabular-nums text-primary",
          compact ? "h-5 w-5" : "h-6 w-6",
        )}
      >
        {index}
      </span>
      <h3
        className={cn(
          "font-semibold tracking-tight",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {title}
      </h3>
    </div>
  );
}

function PostPreview({
  channel,
  handle,
  avatarUrl,
  copy,
  hashtags,
  media,
  location,
}: {
  channel: SocialChannel;
  handle: string;
  avatarUrl: string | null;
  copy: string;
  hashtags: string[];
  media: BrandMediaAsset | undefined;
  location: string;
}) {
  const fullCopy = [copy.trim(), hashtags.map((t) => `#${t}`).join(" ")]
    .filter(Boolean)
    .join("\n\n");
  const initials = (handle || "?").slice(0, 2).toUpperCase();

  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
      {/* Post header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-primary/30">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-[10px] uppercase">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{handle}</div>
            {location ? (
              <div className="truncate text-[10px] text-muted-foreground">{location}</div>
            ) : (
              <div className="truncate text-[10px] capitalize text-muted-foreground">
                {channel}
              </div>
            )}
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Media */}
      <div className="relative aspect-square w-full bg-muted">
        {media?.publicUrl ? (
          media.kind === "video" ? (
            <video
              src={media.publicUrl}
              className="h-full w-full object-cover"
              muted
              playsInline
              loop
              autoPlay
            />
          ) : (
            <img src={media.publicUrl} alt="preview" className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[10.5px]">Nenhuma mídia selecionada</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-3 pt-2.5">
        <div className="flex items-center gap-3 text-foreground">
          <Heart className="h-5 w-5" />
          <MessageSquare className="h-5 w-5" />
          <Share className="h-5 w-5" />
        </div>
        <Bookmark className="h-5 w-5" />
      </div>

      {/* Copy */}
      <div className="px-3 pb-3 pt-2">
        <div className="text-[11.5px] leading-snug">
          <span className="font-semibold">{handle}</span>{" "}
          <span className="whitespace-pre-wrap text-foreground/90">
            {fullCopy || (
              <span className="text-muted-foreground">Sua legenda aparece aqui…</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function fmtDate(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tzLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}