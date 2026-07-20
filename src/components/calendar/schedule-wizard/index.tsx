import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Send,
  X,
  Video as VideoIcon,
  Hash,
  MessageCircle,
  Link2,
  MapPin,
  AlertTriangle,
  Upload,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

type WizardStep = "channels" | "editor" | "summary" | "schedule";

export type WizardSeed = {
  postId?: string;
  title?: string;
  copy?: string;
  coverUrl?: string | null;
};

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

  const [step, setStep] = useState<WizardStep>("channels");
  const [title, setTitle] = useState("");
  const [copy, setCopy] = useState("");
  const [pairs, setPairs] = useState<
    { channel: SocialChannel; format: PlacementFormat; connectionId: string }[]
  >([]);
  const [selectedMedia, setSelectedMedia] = useState<BrandMediaAsset[]>([]);
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [firstComment, setFirstComment] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [locationName, setLocationName] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("channels");
    setTitle(seed?.title ?? "");
    setCopy(seed?.copy ?? "");
    setPairs([]);
    setSelectedMedia([]);
    setHashtags([]);
    setFirstComment("");
    setLinkUrl("");
    setLocationName("");
    if (defaultDate) {
      const d = new Date(defaultDate);
      d.setSeconds(0, 0);
      setScheduleAt(toLocalInput(d));
    } else {
      setScheduleAt("");
    }
  }, [open, seed, defaultDate]);

  const connectionsQ = useQuery({
    enabled: open,
    queryKey: ["wizard-connections", brandId, clientId],
    queryFn: () => listConnections({ data: { brandId, clientId } }),
  });

  useEffect(() => {
    if (!open) return;
    console.log("[wizard] channels step context", {
      brandId,
      clientId,
      status: connectionsQ.status,
      dataLength: connectionsQ.data?.length ?? 0,
      data: connectionsQ.data,
      error: connectionsQ.error,
    });
  }, [open, brandId, clientId, connectionsQ.status, connectionsQ.data, connectionsQ.error]);

  const mediaQ = useQuery({
    enabled: open && step === "editor",
    queryKey: ["wizard-media", brandId, "all"],
    // Sem filtro de kind → biblioteca devolve imagem + vídeo. Vídeos ganham
    // badge de duração no picker e destravam Reels/Stories no seletor de formato.
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

  const mediaKind: MediaKind = useMemo(
    () => inferMediaKind(selectedMedia),
    [selectedMedia],
  );

  // Sempre que a mídia muda, remove pares incompatíveis do estado.
  useEffect(() => {
    setPairs((prev) =>
      prev.filter((p) => isFormatCompatibleWithMedia(p.format, mediaKind)),
    );
  }, [mediaKind]);

  const captionLimit = useMemo(
    () => tightestCaptionLimit(pairs.map((p) => p.channel)),
    [pairs],
  );

  const canContinueChannels = pairs.length > 0;
  const canContinueEditor = title.trim().length > 0 && copy.length <= captionLimit;

  function autoSuggestPairs() {
    // Preenche 1 formato sugerido por canal conectado, respeitando a mídia atual.
    const suggested: typeof pairs = [];
    for (const [channel, conn] of connByChannel.entries()) {
      const [fmt] = suggestFormatsForMedia(channel, mediaKind);
      if (fmt) suggested.push({ channel, format: fmt, connectionId: conn.connectionId });
    }
    if (suggested.length) setPairs(suggested);
  }

  async function persist(action: "draft" | "publish" | "schedule") {
    if (!pairs.length) return;
    setSubmitting(true);
    try {
      await saveFn({
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
          scheduledAt:
            action === "schedule" && scheduleAt
              ? new Date(scheduleAt).toISOString()
              : null,
          action,
        },
      });
      toast.success(
        action === "draft"
          ? "Rascunho salvo"
          : action === "publish"
            ? "Publicação enfileirada"
            : "Agendamento criado",
      );
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["pending-schedule"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao salvar agendamento");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-base">Novo agendamento</DialogTitle>
          <DialogDescription className="text-xs">
            {stepLabel(step)}
          </DialogDescription>
          <WizardSteps active={step} />
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          {step === "channels" ? (
            <StepChannels
              connections={connectionsQ.data ?? []}
              connByChannel={connByChannel}
              loading={connectionsQ.isLoading}
              pairs={pairs}
              mediaKind={mediaKind}
              selectedMediaCount={selectedMedia.length}
              onTogglePair={(channel, format) => {
                const conn = connByChannel.get(channel);
                if (!conn) return;
                if (!isFormatCompatibleWithMedia(format, mediaKind)) {
                  toast.error(
                    formatIncompatibilityReason(format, mediaKind) ??
                      "Formato incompatível com a mídia selecionada.",
                  );
                  return;
                }
                setPairs((prev) => {
                  const exists = prev.find(
                    (p) => p.channel === channel && p.format === format,
                  );
                  if (exists) {
                    return prev.filter(
                      (p) => !(p.channel === channel && p.format === format),
                    );
                  }
                  return [
                    ...prev,
                    { channel, format, connectionId: conn.connectionId },
                  ];
                });
              }}
            />
          ) : null}

          {step === "editor" ? (
            <StepEditor
              brandId={brandId}
              title={title}
              copy={copy}
              captionLimit={captionLimit}
              media={mediaQ.data ?? []}
              selectedMedia={selectedMedia}
              mediaKind={mediaKind}
              hashtags={hashtags}
              firstComment={firstComment}
              linkUrl={linkUrl}
              locationName={locationName}
              onHashtags={setHashtags}
              onFirstComment={setFirstComment}
              onLinkUrl={setLinkUrl}
              onLocationName={setLocationName}
              onAutoSuggest={autoSuggestPairs}
              hasPairs={pairs.length > 0}
              onTitle={setTitle}
              onCopy={setCopy}
              onUploaded={(assets) => {
                setSelectedMedia((prev) => {
                  const merged = [...prev];
                  for (const a of assets) {
                    if (!merged.find((x) => x.id === a.id)) merged.push(a);
                  }
                  return merged;
                });
              }}
              onToggleMedia={(m) => {
                setSelectedMedia((prev) =>
                  prev.find((x) => x.id === m.id)
                    ? prev.filter((x) => x.id !== m.id)
                    : [...prev, m],
                );
              }}
            />
          ) : null}

          {step === "summary" ? (
            <StepSummary
              title={title}
              copy={copy}
              pairs={pairs}
              connByChannel={connByChannel}
              media={selectedMedia}
            />
          ) : null}

          {step === "schedule" ? (
            <StepSchedule value={scheduleAt} onChange={setScheduleAt} />
          ) : null}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-6 py-3">
          <div className="flex items-center gap-2">
            {step !== "channels" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(prevStep(step))}
                disabled={submitting}
              >
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {step === "channels" ? (
              <Button
                size="sm"
                disabled={!canContinueChannels}
                onClick={() => setStep("editor")}
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
            {step === "editor" ? (
              <Button
                size="sm"
                disabled={!canContinueEditor}
                onClick={() => setStep("summary")}
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
            {step === "summary" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => persist("draft")}
                >
                  Salvar rascunho
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => persist("publish")}
                >
                  <Send className="h-4 w-4" /> Publicar agora
                </Button>
                <Button size="sm" onClick={() => setStep("schedule")}>
                  <CalendarClock className="h-4 w-4" /> Agendar
                </Button>
              </>
            ) : null}
            {step === "schedule" ? (
              <Button
                size="sm"
                disabled={submitting || !scheduleAt}
                onClick={() => persist("schedule")}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}{" "}
                Confirmar agendamento
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Helpers e sub-componentes
// ============================================================

function prevStep(s: WizardStep): WizardStep {
  return s === "editor"
    ? "channels"
    : s === "summary"
      ? "editor"
      : s === "schedule"
        ? "summary"
        : "channels";
}

function stepLabel(s: WizardStep) {
  return s === "channels"
    ? "Passo 01 · Onde publicar"
    : s === "editor"
      ? "Passo 02 · Conteúdo e mídia"
      : s === "summary"
        ? "Passo 03 · Revisão"
        : "Passo 04 · Data e horário";
}

function toLocalInput(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WizardSteps({ active }: { active: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: "channels", label: "Canais" },
    { key: "editor", label: "Editor" },
    { key: "summary", label: "Revisão" },
    { key: "schedule", label: "Data" },
  ];
  const idx = steps.findIndex((s) => s.key === active);
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <div
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
              i < idx
                ? "bg-primary/20 text-primary"
                : i === idx
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i + 1}
          </div>
          <span
            className={cn(
              "text-[10px] font-medium",
              i === idx ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StepChannels({
  connections,
  connByChannel,
  loading,
  pairs,
  mediaKind,
  selectedMediaCount,
  onTogglePair,
}: {
  connections: WizardConnection[];
  connByChannel: Map<SocialChannel, WizardConnection>;
  loading: boolean;
  pairs: { channel: SocialChannel; format: PlacementFormat; connectionId: string }[];
  mediaKind: MediaKind;
  selectedMediaCount: number;
  onTogglePair: (c: SocialChannel, f: PlacementFormat) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando conexões…
      </div>
    );
  }
  if (!connections.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
        <p className="text-sm font-medium">Este cliente ainda não tem redes conectadas.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Conecte uma conta social para começar a agendar publicações.
        </p>
        <Button asChild size="sm" className="mt-4">
          <Link to="/connections">Ir para Conexões</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {mediaKind === "none" ? (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
          <span>
            Nenhuma mídia selecionada. Todos os formatos aparecem disponíveis, mas
            Reels exige vídeo e Carrossel exige 2+ imagens — anexe uma mídia no
            passo <b>Editor</b> para o sistema travar as opções incompatíveis.
          </span>
        </div>
      ) : mediaKind === "mixed" ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
          <span>
            Você selecionou imagem <b>e</b> vídeo. A Meta não aceita esse mix numa
            mesma publicação — mantenha apenas um tipo.
          </span>
        </div>
      ) : (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          Mídia atual: <b>{mediaKindLabel(mediaKind)}</b>
          {selectedMediaCount ? ` · ${selectedMediaCount} arquivo(s)` : ""}. Os
          formatos incompatíveis ficam desabilitados.
        </div>
      )}
      {SOCIAL_CHANNELS.map((channel) => {
        const conn = connByChannel.get(channel);
        const formats = FORMATS_BY_CHANNEL[channel] ?? [];
        return (
          <div
            key={channel}
            className={cn(
              "rounded-lg border border-border/60 p-4",
              !conn && "opacity-60",
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={conn?.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[10px] uppercase">
                    {channel.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-semibold capitalize">{channel}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {conn
                      ? conn.handle
                        ? `@${conn.handle}`
                        : conn.accountLabel
                      : "Sem conta conectada"}
                  </div>
                </div>
              </div>
              {conn ? (
                <Badge variant="secondary" className="text-[10px]">
                  Conectado
                </Badge>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to="/connections">Conectar</Link>
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
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
                    disabled={!conn || !compatible}
                    title={
                      !conn
                        ? "Sem conta conectada"
                        : reason ?? `${FORMAT_LABEL[f]} disponível`
                    }
                    onClick={() => onTogglePair(channel, f)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 hover:bg-muted",
                      (!conn || !compatible) &&
                        "cursor-not-allowed opacity-40 hover:bg-transparent",
                    )}
                  >
                    {FORMAT_LABEL[f]}
                    {f === "reels" ? (
                      <span className="ml-1 text-[9px] opacity-60">vídeo</span>
                    ) : f === "carrossel" ? (
                      <span className="ml-1 text-[9px] opacity-60">2+ imgs</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepEditor({
  brandId,
  title,
  copy,
  captionLimit,
  media,
  selectedMedia,
  mediaKind,
  hashtags,
  firstComment,
  linkUrl,
  locationName,
  hasPairs,
  onHashtags,
  onFirstComment,
  onLinkUrl,
  onLocationName,
  onAutoSuggest,
  onTitle,
  onCopy,
  onUploaded,
  onToggleMedia,
}: {
  brandId: string;
  title: string;
  copy: string;
  captionLimit: number;
  media: BrandMediaAsset[];
  selectedMedia: BrandMediaAsset[];
  mediaKind: MediaKind;
  hashtags: string[];
  firstComment: string;
  linkUrl: string;
  locationName: string;
  hasPairs: boolean;
  onHashtags: (v: string[]) => void;
  onFirstComment: (v: string) => void;
  onLinkUrl: (v: string) => void;
  onLocationName: (v: string) => void;
  onAutoSuggest: () => void;
  onTitle: (v: string) => void;
  onCopy: (v: string) => void;
  onUploaded: (assets: BrandMediaAsset[]) => void;
  onToggleMedia: (m: BrandMediaAsset) => void;
}) {
  const overLimit = copy.length > captionLimit;
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const registerMedia = useServerFn(registerBrandMediaFn);
  const qc = useQueryClient();
  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const uploaded: BrandMediaAsset[] = [];
    try {
      for (const file of Array.from(files)) {
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
      onUploaded(uploaded);
      qc.invalidateQueries({ queryKey: ["wizard-media", brandId, "all"] });
      qc.invalidateQueries({ queryKey: ["brand-media", brandId] });
      toast.success(`${uploaded.length} arquivo(s) enviados`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }
  function commitTag() {
    const raw = tagInput.trim().replace(/^#/, "");
    if (!raw) return;
    if (hashtags.includes(raw)) {
      setTagInput("");
      return;
    }
    onHashtags([...hashtags, raw]);
    setTagInput("");
  }
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="wiz-title">Título interno</Label>
        <Input
          id="wiz-title"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Ex.: Lançamento de coleção — reels"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="wiz-copy">Legenda</Label>
          <span
            className={cn(
              "text-[11px] tabular-nums",
              overLimit ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {copy.length}/{captionLimit}
          </span>
        </div>
        <Textarea
          id="wiz-copy"
          value={copy}
          onChange={(e) => onCopy(e.target.value)}
          rows={6}
          placeholder="Escreva a legenda. O limite acima respeita a rede mais restritiva selecionada."
        />
      </div>

      {/* -------- Hashtags -------- */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5" /> Hashtags
          <span className="text-[10px] font-normal text-muted-foreground">
            (entrar ou vírgula para adicionar)
          </span>
        </Label>
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 p-2">
          {hashtags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
            >
              #{t}
              <button
                type="button"
                onClick={() => onHashtags(hashtags.filter((x) => x !== t))}
                className="text-primary/70 hover:text-primary"
              >
                <X className="h-3 w-3" />
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
                onHashtags(hashtags.slice(0, -1));
              }
            }}
            onBlur={commitTag}
            placeholder={hashtags.length ? "" : "marketing, unitos, launch…"}
            className="min-w-[120px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* -------- Extras -------- */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wiz-first-comment" className="flex items-center gap-1.5 text-xs">
            <MessageCircle className="h-3.5 w-3.5" /> Primeiro comentário
            <span className="text-[10px] font-normal text-muted-foreground">Instagram</span>
          </Label>
          <Textarea
            id="wiz-first-comment"
            rows={2}
            value={firstComment}
            onChange={(e) => onFirstComment(e.target.value)}
            placeholder="Comentário fixado após o post (dica: pool de hashtags)."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wiz-link" className="flex items-center gap-1.5 text-xs">
            <Link2 className="h-3.5 w-3.5" /> Link
            <span className="text-[10px] font-normal text-muted-foreground">Facebook</span>
          </Label>
          <Input
            id="wiz-link"
            type="url"
            value={linkUrl}
            onChange={(e) => onLinkUrl(e.target.value)}
            placeholder="https://…"
          />
          <Label htmlFor="wiz-location" className="mt-2 flex items-center gap-1.5 text-xs">
            <MapPin className="h-3.5 w-3.5" /> Localização
            <span className="text-[10px] font-normal text-muted-foreground">opcional</span>
          </Label>
          <Input
            id="wiz-location"
            value={locationName}
            onChange={(e) => onLocationName(e.target.value)}
            placeholder="Ex.: São Paulo, SP"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            Mídia
            {mediaKind !== "none" ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
                {mediaKindLabel(mediaKind)}
              </span>
            ) : null}
          </Label>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{selectedMedia.length} selecionada(s)</span>
            {mediaKind !== "none" && mediaKind !== "mixed" && !hasPairs ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={onAutoSuggest}
              >
                Sugerir formatos
              </Button>
            ) : null}
          </div>
        </div>
        {mediaKind === "mixed" ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            <span>Remova imagens OU vídeos — só um tipo por publicação.</span>
          </div>
        ) : null}
        {media.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            <ImageIcon className="mx-auto mb-2 h-5 w-5" />
            Nenhuma mídia na biblioteca. Faça upload de imagens ou vídeos na aba
            <b> Mídias</b> do cliente.
          </div>
        ) : (
          <ScrollArea className="h-56 rounded-lg border border-border/60">
            <div className="grid grid-cols-4 gap-2 p-2">
              {media.map((m) => {
                const selected = selectedMedia.some((x) => x.id === m.id);
                const isVideo = m.kind === "video";
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onToggleMedia(m)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-md border-2 bg-muted transition-all",
                      selected ? "border-primary" : "border-transparent hover:border-border",
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
                      <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        <VideoIcon className="h-2.5 w-2.5" /> vídeo
                      </span>
                    ) : null}
                    {selected ? (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <b>Sobre música em Reels:</b> a API oficial da Meta exige um{" "}
        <code>music_track_id</code> do catálogo licenciado, que ainda não é
        exposto publicamente. Recomendação: publique o áudio embutido no arquivo
        de vídeo e sinalize a trilha na legenda.
      </div>
    </div>
  );
}

function mediaKindLabel(k: MediaKind): string {
  switch (k) {
    case "single_image":
      return "1 imagem";
    case "multi_image":
      return "2+ imagens";
    case "video":
      return "vídeo";
    case "mixed":
      return "mix inválido";
    default:
      return "sem mídia";
  }
}

function StepSummary({
  title,
  copy,
  pairs,
  connByChannel,
  media,
}: {
  title: string;
  copy: string;
  pairs: { channel: SocialChannel; format: PlacementFormat; connectionId: string }[];
  connByChannel: Map<SocialChannel, WizardConnection>;
  media: BrandMediaAsset[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Título
        </div>
        <div className="mt-1 text-sm">{title || "—"}</div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Legenda
        </div>
        <div className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
          {copy || "—"}
        </div>
      </div>
      <Separator />
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Destinos ({pairs.length})
        </div>
        <div className="space-y-2">
          {pairs.map((p, i) => {
            const conn = connByChannel.get(p.channel);
            return (
              <div
                key={i}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={conn?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-[9px] uppercase">
                      {p.channel.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium capitalize">{p.channel}</div>
                    <div className="text-xs text-muted-foreground">
                      {conn?.handle ? `@${conn.handle}` : conn?.accountLabel ?? "—"}
                    </div>
                  </div>
                </div>
                <Badge variant="outline">{FORMAT_LABEL[p.format]}</Badge>
              </div>
            );
          })}
        </div>
      </div>
      {media.length ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mídia ({media.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {media.map((m) => (
              <div
                key={m.id}
                className="h-14 w-14 overflow-hidden rounded-md border border-border/60"
              >
                {m.publicUrl ? (
                  <img
                    src={m.publicUrl}
                    alt={m.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepSchedule({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const min = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    d.setSeconds(0, 0);
    return toLocalInput(d);
  }, []);
  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "";
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wiz-when">Data e horário</Label>
        <Input
          id="wiz-when"
          type="datetime-local"
          value={value}
          min={min}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Fuso horário: {tz}. Mínimo 5 minutos a partir de agora.
        </p>
      </div>
      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Ao confirmar, o post entra na fila de publicação e aparece no calendário
        com status <span className="font-medium text-foreground">Agendado</span>.
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keepXIcon = X;
