import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { describeError } from "@/lib/errors";
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  LayoutGrid,
  Play,
  Layers,
  CircleDot,
  Image as ImageIcon,
  Loader2,
  Send,
  Sparkles,
  UploadCloud,
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
import { ExpandedModal } from "@/components/ui/expanded-modal";
import { MediaLibraryDialog } from "@/components/calendar/schedule-wizard/media-library-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  loadPostStateFn,
  saveScheduledPostFn,
  cancelPostScheduleFn,
  type WizardConnection,
} from "@/lib/scheduling-wizard.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


import {
  listBrandMediaFn,
  registerBrandMediaFn,
  type BrandMediaAsset,
} from "@/lib/brand-media.functions";
import { searchInstagramLocationsFn } from "@/lib/meta/locations.functions";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function slugifyMediaName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

const FORMAT_ICON: Record<PlacementFormat, typeof LayoutGrid> = {
  feed: LayoutGrid,
  stories: CircleDot,
  reels: Play,
  carrossel: Layers,
};

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
  const loadPostState = useServerFn(loadPostStateFn);

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
  const [submitting, setSubmitting] = useState<
    null | "draft" | "publish" | "schedule" | "save_draft"
  >(null);
  const [previewKey, setPreviewKey] = useState<string>("instagram::feed");
  const [locationId, setLocationId] = useState<string | null>(null);
  // ID da peça em edição. Começa no seed e passa a existir localmente depois do
  // primeiro save — impede que "Salvar rascunho" duas vezes crie duas peças.
  const [postId, setPostId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);
  // UI local do composer (não persiste nada).
  const [destPickerOpen, setDestPickerOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

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
      setLocationId(null);
      setDragActive(false);
      setUploading(false);
      setSubmitting(null);
      setPreviewKey("instagram::feed");
      setPostId(seed?.postId ?? null);
      setDestPickerOpen(false);
      setLibraryOpen(false);
      setShowExtras(false);
      if (uploadRef.current) uploadRef.current.value = "";
      const base = defaultDate ? new Date(defaultDate) : new Date(Date.now() + 60 * 60 * 1000);
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

  // Reabrir peça existente = restaurar o estado COMPLETO (mídia, destinos,
  // hashtags, link, local, agendamento). Sem isso o rascunho voltava vazio.
  const hydratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      hydratedForRef.current = null;
      return;
    }
    const id = seed?.postId;
    if (!id || hydratedForRef.current === id) return;
    hydratedForRef.current = id;
    let cancelled = false;
    setHydrating(true);
    loadPostState({ data: { postId: id, brandId } })
      .then((st) => {
        if (cancelled) return;
        setTitle(st.title || seed?.title || "");
        setCopy(st.copy ?? "");
        setHashtags(st.hashtags ?? []);
        setFirstComment(st.firstComment ?? "");
        setLinkUrl(st.linkUrl ?? "");
        setLocationName(st.locationName ?? "");
        setLocationId(st.locationId ?? null);
        setPairs(
          (st.destinations ?? []).map((d) => ({
            channel: d.channel as SocialChannel,
            format: d.format as PlacementFormat,
            connectionId: d.connectionId,
          })),
        );
        setSelectedMedia(
          (st.media ?? []).map((m) => ({
            id: m.id,
            brandId,
            clientId,
            storagePath: m.storagePath,
            name: m.name,
            mimeType: m.mimeType,
            sizeBytes: 0,
            kind: m.kind,
            width: null,
            height: null,
            tags: [],
            createdAt: new Date().toISOString(),
            publicUrl: m.publicUrl,
          })),
        );
        if (st.scheduledAt) {
          const d = new Date(st.scheduledAt);
          setScheduleDate(fmtDate(d));
          setScheduleTime(fmtTime(d));
        }
      })
      .catch((e) => toast.error(describeError(e)))
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, seed?.postId, brandId, clientId, loadPostState, seed?.title]);

  // Pré-preenche destinos a partir das conexões escolhidas na tela de Conteúdo
  // (Kanban → target_connection_ids), quando o wizard abre com um seed.
  useEffect(() => {
    if (!open || hydrating) return;
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
          format: "feed" satisfies PlacementFormat,
          connectionId: id,
        });
      }
      return next;
    });
  }, [open, hydrating, seed?.targetConnectionIds, connectionsQ.data]);

  const mediaQ = useQuery({
    enabled: open,
    queryKey: ["wizard-media", brandId, clientId],
    queryFn: () => listMedia({ data: { brandId, clientId, limit: 60 } }),
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
    if (hydrating) return;
    setPairs((prev) => prev.filter((p) => isFormatCompatibleWithMedia(p.format, mediaKind)));
  }, [mediaKind, hydrating]);

  // Ensure preview channel is one we have selected — else fall back to first pair
  useEffect(() => {
    if (!pairs.length) return;
    if (!pairs.some((p) => `${p.channel}::${p.format}` === previewKey)) {
      setPreviewKey(`${pairs[0].channel}::${pairs[0].format}`);
    }
  }, [pairs, previewKey]);

  const previewPair = useMemo(() => {
    const found = pairs.find((p) => `${p.channel}::${p.format}` === previewKey);
    return found ?? pairs[0] ?? null;
  }, [pairs, previewKey]);

  const cyclePreview = useCallback(
    (dir: 1 | -1) => {
      if (pairs.length <= 1) return;
      const idx = Math.max(
        0,
        pairs.findIndex((p) => `${p.channel}::${p.format}` === previewKey),
      );
      const next = pairs[(idx + dir + pairs.length) % pairs.length];
      setPreviewKey(`${next.channel}::${next.format}`);
    },
    [pairs, previewKey],
  );

  const captionLimit = useMemo(() => tightestCaptionLimit(pairs.map((p) => p.channel)), [pairs]);

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
          const path = `${brandId}/${clientId}/${crypto.randomUUID()}-${slugifyMediaName(file.name)}`;
          const { error: upErr } = await supabase.storage
            .from("brand-media")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw new Error(upErr.message);
          const asset = await registerMedia({
            data: {
              brandId,
              clientId,
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
        qc.invalidateQueries({ queryKey: ["wizard-media", brandId, clientId] });
        qc.invalidateQueries({ queryKey: ["brand-media", brandId] });
        toast.success(`${uploaded.length} arquivo(s) enviados`);
      } catch (e) {
        toast.error(describeError(e));
      } finally {
        setUploading(false);
        if (uploadRef.current) uploadRef.current.value = "";
      }
    },
    [brandId, clientId, qc, registerMedia],
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
    if (submitting) return;
    if (hydrating) {
      toast.error("Aguarde o carregamento da peça.");
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
          // Sempre a peça em edição (local), nunca só o seed — evita duplicar
          // a peça quando o usuário salva o rascunho mais de uma vez.
          postId: postId ?? seed?.postId ?? null,
          brandId,
          clientId,
          title: title.trim() || "Publicação sem título",
          copy,
          mediaPaths: selectedMedia.map((m) => m.storagePath),
          mediaAssetIds: selectedMedia.map((m) => m.id),
          hashtags,
          firstComment: firstComment.trim() || null,
          linkUrl: linkUrl.trim() || null,
          locationName: locationName.trim() || null,
          locationId: locationId ?? null,
          destinations: pairs.map((p) => ({
            connectionId: p.connectionId,
            channel: p.channel,
            format: p.format,
          })),
          scheduledAt: scheduledIso,
          action,
        },
      });
      if (res?.postId) setPostId(res.postId as string);
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

  const primaryConn =
    (previewPair ? connByChannel.get(previewPair.channel) : null) ?? connectionsQ.data?.[0];
  const previewMedia = selectedMedia[0];

  // Política de link por rede/formato — feed do IG/Reels/TikTok não
  // renderiza URL clicável; Stories vira sticker; LinkedIn/FB/X funcionam.
  const linkPolicy = useMemo(() => {
    if (!pairs.length) return "none" as const;
    const policies = pairs.map((p) => classifyLinkPolicy(p.channel, p.format));
    const unique = Array.from(new Set(policies));
    if (unique.length === 1) return unique[0];
    return "mixed" as const;
  }, [pairs]);

  // Conexão Instagram para o autocomplete de local.
  const instagramConn = useMemo(
    () => (connectionsQ.data ?? []).find((c) => c.channel === "instagram") ?? null,
    [connectionsQ.data],
  );

  // Atalho ESC — fecha o sheet quando não estiver enviando.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onOpenChange(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!submitting) void persist("save_draft");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  const busy = !!submitting || hydrating;
  const selectedIds = selectedMedia.map((m) => m.id);
  const availableConnections = connectionsQ.data ?? [];

  return (
    <>
      <ExpandedModal
        open={open}
        onOpenChange={(v) => {
          if (!v && submitting) return;
          onOpenChange(v);
        }}
        size="composer"
        className="sm:h-[min(936px,calc(100dvh-2rem))] sm:max-h-[calc(100dvh-2rem)]"
        title={postId ? "Editar publicação" : "Nova publicação"}
        description={
          pairs.length
            ? `${pairs.length} destino(s) · ${selectedMedia.length} mídia(s) · limite ${captionLimit} caracteres`
            : "Escolha os destinos, escreva a legenda e agende"
        }
        headerExtra={
          <>
            {hydrating ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Restaurando…
              </span>
            ) : null}
            {postId ? (
              <Badge variant="outline" className="text-[10px]">
                Rascunho salvo
              </Badge>
            ) : null}
          </>
        }
        bodyClassName="grid min-h-0 grid-cols-1 overflow-hidden p-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,432px)]"
        footerClassName="justify-between"
        footer={
          <>
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
              {submitting ? (
                <span className="flex items-center gap-2 text-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {submitting === "publish"
                    ? "Publicando…"
                    : submitting === "schedule"
                      ? "Agendando…"
                      : submitting === "save_draft"
                        ? "Salvando rascunho…"
                        : "Enviando para aprovação…"}
                </span>
              ) : pairs.length ? (
                <span className={cn("tabular-nums", overLimit && "text-destructive")}>
                  {copy.length}/{captionLimit} caracteres
                </span>
              ) : (
                <span>Selecione ao menos um destino.</span>
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
                disabled={busy || uploading}
                onClick={() => persist("save_draft")}
                title="Salvar como rascunho para continuar depois"
              >
                {submitting === "save_draft" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {postId ? "Salvar alterações" : "Salvar rascunho"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canSubmit || busy || uploading}
                onClick={() => persist("draft")}
              >
                Enviar para aprovação
              </Button>
              <div className="inline-flex overflow-hidden rounded-md">
                <Button
                  size="sm"
                  className="rounded-r-none"
                  disabled={!canSubmit || busy || uploading}
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
                      disabled={!canSubmit || busy || uploading}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => persist("publish")} disabled={busy}>
                      <Send className="mr-2 h-3.5 w-3.5" /> Publicar agora
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => persist("schedule")} disabled={busy}>
                      <CalendarClock className="mr-2 h-3.5 w-3.5" /> Agendar para depois
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        }
      >
        {/* ---------------- Coluna 1 — edição ---------------- */}
        <div className="min-h-0 space-y-5 overflow-y-auto border-b border-border/60 px-5 py-4 lg:border-b-0 lg:border-r">
          {/* Destinos */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Destinos</Label>
              <div className="flex items-center gap-1">
                {mediaKind !== "none" && availableConnections.length ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={autoSuggestPairs}
                  >
                    <Sparkles className="mr-1 h-3 w-3" /> Sugerir
                  </Button>
                ) : null}
                <Popover open={destPickerOpen} onOpenChange={setDestPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-[11px]">
                      Gerenciar destinos
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[340px] p-2">
                    {connectionsQ.isLoading ? (
                      <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando conexões…
                      </div>
                    ) : availableConnections.length === 0 ? (
                      <div className="p-3 text-center">
                        <p className="text-xs font-medium">
                          Nenhuma rede vinculada a este cliente.
                        </p>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="mt-2 h-7 text-[11px]"
                        >
                          <Link to="/connections">Ir para Conexões</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="max-h-[340px] space-y-2 overflow-y-auto">
                        {SOCIAL_CHANNELS.map((channel) => {
                          const conn = connByChannel.get(channel);
                          if (!conn) return null;
                          const formats = FORMATS_BY_CHANNEL[channel] ?? [];
                          return (
                            <div
                              key={channel}
                              className="rounded-lg border border-border/60 bg-card/40 p-2"
                            >
                              <div className="mb-1.5 flex min-w-0 items-center gap-2">
                                <Avatar className="h-6 w-6 shrink-0">
                                  <AvatarImage src={conn.avatarUrl ?? undefined} />
                                  <AvatarFallback className="text-[9px] uppercase">
                                    {channel.slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] font-semibold capitalize">
                                    {channel}
                                  </div>
                                  <div className="truncate text-[10px] text-muted-foreground">
                                    {conn.handle ? `@${conn.handle}` : conn.accountLabel}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {formats.map((f) => {
                                  const selected = pairs.some(
                                    (p) => p.channel === channel && p.format === f,
                                  );
                                  const compatible = isFormatCompatibleWithMedia(f, mediaKind);
                                  const reason = formatIncompatibilityReason(f, mediaKind);
                                  const Icon = FORMAT_ICON[f];
                                  return (
                                    <button
                                      key={f}
                                      type="button"
                                      disabled={!compatible}
                                      aria-pressed={selected}
                                      title={reason ?? `${FORMAT_LABEL[f]} disponível`}
                                      onClick={() => togglePair(channel, f)}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors",
                                        selected
                                          ? "border-foreground bg-foreground text-background"
                                          : "border-border/60 text-muted-foreground hover:text-foreground",
                                        !compatible && "cursor-not-allowed opacity-40",
                                      )}
                                    >
                                      <Icon className="h-3 w-3" />
                                      {FORMAT_LABEL[f]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {pairs.length === 0 ? (
              <button
                type="button"
                onClick={() => setDestPickerOpen(true)}
                className="w-full rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
              >
                Nenhum destino selecionado — clique para escolher canais e formatos.
              </button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pairs.map((p) => {
                  const Icon = FORMAT_ICON[p.format];
                  const conn = connByChannel.get(p.channel);
                  return (
                    <span
                      key={`${p.channel}::${p.format}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2 py-1 text-[10.5px]"
                    >
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={conn?.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-[7px] uppercase">
                          {p.channel.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="capitalize">
                        {p.channel} · {FORMAT_LABEL[p.format]}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePair(p.channel, p.format)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remover destino"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          {/* Conteúdo */}
          <section className="space-y-3">
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="wiz-copy" className="text-xs">
                  Legenda
                </Label>
                <span
                  className={cn(
                    "text-[10.5px] tabular-nums",
                    overLimit ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {copy.length}/{captionLimit}
                </span>
              </div>
              <Textarea
                id="wiz-copy"
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                rows={7}
                placeholder="Escreva a legenda. Quebras de linha e parágrafos são preservados exatamente como digitados."
                className={cn(
                  "whitespace-pre-wrap font-normal",
                  overLimit && "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>

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
          </section>

          <Separator />

          {/* Mídia — experiência unificada */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Mídia da publicação{selectedMedia.length ? ` (${selectedMedia.length})` : ""}
              </Label>
              <div className="flex items-center gap-1">
                <input
                  ref={uploadRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={uploading}
                  onClick={() => uploadRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <UploadCloud className="mr-1 h-3 w-3" />
                  )}
                  Enviar arquivo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setLibraryOpen(true)}
                >
                  <ImageIcon className="mr-1 h-3 w-3" /> Biblioteca
                </Button>
              </div>
            </div>

            {mediaKind === "mixed" ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                <span>Remova imagens OU vídeos — apenas um tipo é permitido por publicação.</span>
              </div>
            ) : null}

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
                "rounded-xl border-2 border-dashed p-3 transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border/70 bg-muted/20",
              )}
            >
              {selectedMedia.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedMedia.map((m, i) => (
                    <div
                      key={m.id}
                      className="relative h-20 w-20 overflow-hidden rounded-md border border-border/60 bg-muted"
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
                      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">
                        {i + 1}
                      </span>
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
                  <button
                    type="button"
                    onClick={() => setLibraryOpen(true)}
                    className="grid h-20 w-20 place-items-center rounded-md border border-dashed border-border/70 text-muted-foreground transition-colors hover:bg-muted/40"
                    title="Adicionar mídia"
                  >
                    <span className="text-lg leading-none">+</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-3 text-center">
                  <UploadCloud className="h-5 w-5 text-muted-foreground" />
                  <p className="text-[11px] font-medium">
                    Arraste arquivos aqui, envie do computador ou escolha na biblioteca
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Imagens ou vídeos até 100MB · a mídia fica salva na peça
                  </p>
                </div>
              )}
            </div>
          </section>

          <Separator />

          {/* Configurações adicionais */}
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setShowExtras((v) => !v)}
              className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>Configurações adicionais (link, local, primeiro comentário)</span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showExtras && "rotate-180")}
              />
            </button>
            {showExtras ? (
              <div className="space-y-3 rounded-lg border border-border/60 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-first-comment" className="flex items-center gap-1.5 text-xs">
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
                    {linkUrl && linkPolicy !== "clickable" && linkPolicy !== "none" ? (
                      <p className="text-[10.5px] text-amber-600 dark:text-amber-400">
                        {linkPolicy === "not-clickable"
                          ? "Instagram/TikTok/Reels não tornam links clicáveis na legenda — use link na bio."
                          : linkPolicy === "sticker"
                            ? "Em Stories o link vira sticker — a URL não aparece no texto."
                            : "Seleções mistas: o link só é clicável em algumas redes."}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-location" className="flex items-center gap-1.5 text-xs">
                      <MapPin className="h-3 w-3" /> Local
                    </Label>
                    <LocationCombobox
                      brandId={brandId}
                      instagramConnectionId={instagramConn?.connectionId ?? null}
                      value={locationName}
                      onChange={(name, id) => {
                        setLocationName(name);
                        setLocationId(id);
                      }}
                    />
                    {locationName && !locationId ? (
                      <p className="text-[10.5px] text-muted-foreground">
                        Local salvo como texto — selecione uma sugestão para marcar no Instagram.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        {/* ---------------- Coluna 2 — agenda + preview ---------------- */}
        <div className="min-h-0 space-y-4 overflow-y-auto bg-muted/20 px-4 py-4">
          <section className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
            <Label className="text-xs">Data & horário</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Input
                  type="date"
                  value={scheduleDate}
                  min={fmtDate(new Date())}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="pr-8 [&::-webkit-calendar-picker-indicator]:opacity-0"
                />
                <CalendarIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="relative">
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="pr-8 [&::-webkit-calendar-picker-indicator]:opacity-0"
                />
                <ClockIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <p className="text-[10.5px] text-muted-foreground">
              Fuso: {tzLabel()} · use “Publicar agora” no menu ao lado de “Agendar”.
            </p>
          </section>

          <section className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Preview</Label>
              {pairs.length > 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => cyclePreview(-1)}
                    aria-label="Destino anterior"
                    className="grid h-6 w-6 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => cyclePreview(1)}
                    aria-label="Próximo destino"
                    className="grid h-6 w-6 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
            </div>
            {pairs.length ? (
              <div className="flex flex-wrap gap-1">
                {pairs.map((p) => {
                  const k = `${p.channel}::${p.format}`;
                  const active = previewKey === k;
                  const Icon = FORMAT_ICON[p.format];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPreviewKey(k)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium capitalize transition-colors",
                        active
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {p.channel}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10.5px] text-muted-foreground">
                Selecione um destino para pré-visualizar.
              </p>
            )}
            <div className="flex justify-center pt-1">
              <PostPreview
                channel={previewPair?.channel ?? "instagram"}
                format={previewPair?.format ?? "feed"}
                handle={primaryConn?.handle ?? primaryConn?.accountLabel ?? "sua_marca"}
                avatarUrl={primaryConn?.avatarUrl ?? null}
                copy={copy}
                hashtags={hashtags}
                media={previewMedia}
                mediaCount={selectedMedia.length}
                location={locationName}
              />
            </div>
          </section>
        </div>
      </ExpandedModal>

      {open ? (
        <MediaLibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          brandId={brandId}
          clientId={clientId}
          selectedIds={selectedIds}
          onConfirm={(assets) => setSelectedMedia(assets)}
        />
      ) : null}
    </>
  );
}

// ============================================================
// Sub-components
// ============================================================

function PostPreview({
  channel,
  format,
  handle,
  avatarUrl,
  copy,
  hashtags,
  media,
  mediaCount,
  location,
}: {
  channel: SocialChannel;
  format: PlacementFormat;
  handle: string;
  avatarUrl: string | null;
  copy: string;
  hashtags: string[];
  media: BrandMediaAsset | undefined;
  mediaCount: number;
  location: string;
}) {
  const fullCopy = [copy.trim(), hashtags.map((t) => `#${t}`).join(" ")]
    .filter(Boolean)
    .join("\n\n");
  const initials = (handle || "?").slice(0, 2).toUpperCase();
  const vertical =
    format === "reels" || format === "stories" || channel === "tiktok" || channel === "youtube";
  const wideMedia = channel === "linkedin" || channel === "x";
  const isStories = format === "stories";
  const isReels = format === "reels" || channel === "tiktok" || channel === "youtube";
  const chromeStyle = channelChromeStyle(channel);

  if (vertical) {
    // Reels/TikTok/Shorts/Stories — full-bleed 9:16 com overlay.
    return (
      <div
        className="relative w-full max-w-[300px] overflow-hidden rounded-2xl border border-border/60 bg-black shadow-lg"
        style={{ aspectRatio: "9 / 16" }}
      >
        {media?.publicUrl ? (
          media.kind === "video" ? (
            <video
              src={media.publicUrl}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              playsInline
              loop
              autoPlay
            />
          ) : (
            <img
              src={media.publicUrl}
              alt="preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/60">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[10.5px]">Nenhuma mídia selecionada</span>
          </div>
        )}
        {/* Top gradient + header (Stories mostra barra de progresso) */}
        <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/60 to-transparent p-3">
          {isStories ? (
            <div className="mb-2 flex gap-1">
              <div className="h-0.5 flex-1 rounded-full bg-white/80" />
              <div className="h-0.5 flex-1 rounded-full bg-white/30" />
              <div className="h-0.5 flex-1 rounded-full bg-white/30" />
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-white">
            <Avatar className="h-6 w-6 shrink-0 ring-1 ring-white/60">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="text-[9px] uppercase">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-[11px] font-semibold drop-shadow">{handle}</span>
            {location ? (
              <span className="truncate text-[10px] text-white/80 drop-shadow">· {location}</span>
            ) : null}
          </div>
        </div>
        {/* Right rail — Reels/TikTok */}
        {isReels ? (
          <div className="absolute bottom-16 right-2 z-10 flex flex-col items-center gap-3 text-white drop-shadow">
            <Heart className="h-5 w-5" />
            <MessageSquare className="h-5 w-5" />
            <Share className="h-5 w-5" />
            <Bookmark className="h-5 w-5" />
          </div>
        ) : null}
        {/* Bottom overlay copy (Reels/TikTok) */}
        {isReels ? (
          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
            <div className="text-[11px] font-semibold drop-shadow">{handle}</div>
            <div className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[10.5px] drop-shadow">
              {fullCopy || <span className="text-white/60">Sua legenda aparece aqui…</span>}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Feed padrão (IG/FB/LinkedIn/X)
  return (
    <div
      className={cn(
        "w-full max-w-[380px] overflow-hidden rounded-2xl border shadow-sm",
        chromeStyle.card,
      )}
    >
      {/* Header (X mostra @handle · texto acima da mídia) */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className={cn("h-8 w-8 shrink-0", chromeStyle.avatarRing)}>
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-[10px] uppercase">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{handle}</div>
            {location ? (
              <div className="truncate text-[10px] text-muted-foreground">{location}</div>
            ) : (
              <div className="truncate text-[10px] capitalize text-muted-foreground">{channel}</div>
            )}
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Copy acima da mídia — LinkedIn/X */}
      {(channel === "linkedin" || channel === "x") && fullCopy ? (
        <div className="px-3 pb-2 text-[11.5px] leading-snug">
          <span className="whitespace-pre-wrap text-foreground/90">{fullCopy}</span>
        </div>
      ) : null}

      {/* Media */}
      <div
        className="relative w-full bg-muted"
        style={{ aspectRatio: wideMedia ? "1.91 / 1" : "1 / 1" }}
      >
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
        {/* Carousel dots */}
        {format === "carrossel" && mediaCount > 1 ? (
          <div className="absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-1">
            {Array.from({ length: Math.min(mediaCount, 10) }).map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-1.5 rounded-full", i === 0 ? "bg-white" : "bg-white/50")}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Actions bar — Instagram/Facebook only */}
      {channel === "instagram" || channel === "facebook" ? (
        <div className="flex items-center justify-between px-3 pt-2.5">
          <div className="flex items-center gap-3 text-foreground">
            <Heart className="h-5 w-5" />
            <MessageSquare className="h-5 w-5" />
            <Share className="h-5 w-5" />
          </div>
          <Bookmark className="h-5 w-5" />
        </div>
      ) : null}

      {/* Copy abaixo — IG/FB */}
      {channel === "instagram" || channel === "facebook" ? (
        <div className="px-3 pb-3 pt-2">
          <div className="text-[11.5px] leading-snug">
            <span className="font-semibold">{handle}</span>{" "}
            <span className="whitespace-pre-wrap text-foreground/90">
              {fullCopy || <span className="text-muted-foreground">Sua legenda aparece aqui…</span>}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function channelChromeStyle(channel: SocialChannel) {
  switch (channel) {
    case "linkedin":
      return {
        card: "border-[#0A66C2]/20 bg-background",
        avatarRing: "ring-2 ring-[#0A66C2]/30",
      };
    case "x":
      return {
        card: "border-neutral-800 bg-background",
        avatarRing: "ring-2 ring-neutral-500/40",
      };
    case "facebook":
      return {
        card: "border-[#1877F2]/20 bg-background",
        avatarRing: "ring-2 ring-[#1877F2]/30",
      };
    default:
      return {
        card: "border-border/60 bg-background",
        avatarRing: "ring-2 ring-primary/30",
      };
  }
}

// ============================================================
// Link policy — sinaliza se o link será clicável na rede escolhida.
// ============================================================

export type LinkPolicy = "none" | "clickable" | "sticker" | "not-clickable" | "mixed";

function classifyLinkPolicy(channel: SocialChannel, format: PlacementFormat): LinkPolicy {
  // Stories: Instagram/Facebook viram sticker de link.
  if (format === "stories") return "sticker";
  // Instagram feed/reels/carrossel: link não é clicável na legenda.
  if (channel === "instagram") return "not-clickable";
  // TikTok / YouTube Shorts (mapeados como reels): também não clicáveis na caption.
  if (channel === "tiktok" || channel === "youtube") return "not-clickable";
  // Facebook / LinkedIn / X / Threads: link clicável no feed.
  return "clickable";
}

// ============================================================
// LocationCombobox — busca locais do Graph com debounce.
// ============================================================

function LocationCombobox({
  brandId,
  instagramConnectionId,
  value,
  onChange,
}: {
  brandId: string;
  instagramConnectionId: string | null;
  value: string;
  onChange: (name: string, id: string | null) => void;
}) {
  const searchFn = useServerFn(searchInstagramLocationsFn);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    setQ(value);
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const searchQ = useQuery({
    enabled: open && !!instagramConnectionId && debounced.length >= 2,
    queryKey: ["ig-location", instagramConnectionId, debounced],
    queryFn: () =>
      searchFn({
        data: {
          brandId,
          connectionId: instagramConnectionId ?? "",
          query: debounced,
        },
      }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id="wiz-location"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            onChange(e.target.value, null);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            instagramConnectionId ? "Digite para buscar no Instagram…" : "Ex.: São Paulo, SP"
          }
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!instagramConnectionId ? (
          <div className="p-2 text-[11px] text-muted-foreground">
            Conecte um Instagram para buscar locais reais.
          </div>
        ) : debounced.length < 2 ? (
          <div className="p-2 text-[11px] text-muted-foreground">
            Digite ao menos 2 letras para buscar.
          </div>
        ) : searchQ.isFetching ? (
          <div className="flex items-center gap-2 p-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
          </div>
        ) : searchQ.data && !searchQ.data.ok ? (
          <div className="max-w-full break-words p-2 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
            {searchQ.data.error ?? "Falha na busca."}
          </div>

        ) : (searchQ.data?.results ?? []).length === 0 ? (
          <div className="p-2 text-[11px] text-muted-foreground">
            Nenhum local encontrado para “{debounced}”.
          </div>
        ) : (
          <ul className="max-h-64 overflow-auto">
            {(searchQ.data?.results ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-[11.5px] hover:bg-muted"
                  onClick={() => {
                    onChange(r.name, r.id);
                    setQ(r.name);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{r.name}</span>
                  {r.subtitle ? (
                    <span className="text-[10px] text-muted-foreground">{r.subtitle}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
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
