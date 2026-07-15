import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveContext } from "@/hooks/use-active-context";
import { listScheduledPostsFn, type CalendarPost } from "@/lib/calendar.functions";
import { usePageHeader } from "@/hooks/use-page-header";
import { GeneratePlanDialog } from "@/components/calendar/generate-plan-dialog";
import { TaskDialog } from "@/components/content/task-dialog";
import { loadBoardFn, ensureDefaultPipelineFn, type PipelineStage } from "@/lib/content.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import {
  DashboardPageShell,
  DashboardPanelSurface,
  DashboardIconFrame,
} from "@/components/ui/dashboard-primitives";
import { KpiCard, type KpiTone } from "@/components/ui/kpi-card";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function CalendarPage() {
  const { brandId, clientId } = useActiveContext();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const list = useServerFn(listScheduledPostsFn);
  const qc = useQueryClient();
  const [openPost, setOpenPost] = useState<CalendarPost | null>(null);
  const [openingPost, setOpeningPost] = useState(false);
  const loadBoard = useServerFn(loadBoardFn);
  const ensurePipeline = useServerFn(ensureDefaultPipelineFn);
  const [createCtx, setCreateCtx] = useState<
    | { date: Date; pipelineId: string; stages: PipelineStage[] }
    | null
  >(null);
  const [creating, setCreating] = useState(false);

  async function handleOpenPost(p: CalendarPost) {
    if (openingPost) return;
    // Legacy posts may not have a pipeline_id — ensure one on the fly.
    if (!p.pipeline_id) {
      try {
        setOpeningPost(true);
        const pipe = await ensurePipeline({
          data: { brandId: p.brand_id, clientId: p.client_id },
        });
        setOpenPost({ ...p, pipeline_id: pipe.id });
      } catch (e) {
        toast.error((e as Error).message || "Não foi possível abrir este conteúdo");
      } finally {
        setOpeningPost(false);
      }
      return;
    }
    setOpenPost(p);
  }

  async function handleCreateOnDate(date: Date) {
    if (!brandId) return;
    if (!clientId) {
      toast.error("Selecione um cliente para criar conteúdo manualmente.");
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const pipe = await ensurePipeline({ data: { brandId, clientId } });
      const board = await loadBoard({
        data: { brandId, clientId, pipelineId: pipe.id },
      });
      // Default publish time: 10:00 local on the picked day
      const scheduled = new Date(date);
      scheduled.setHours(10, 0, 0, 0);
      setCreateCtx({
        date: scheduled,
        pipelineId: pipe.id,
        stages: board.stages,
      });
    } catch (e) {
      toast.error((e as Error).message || "Falha ao preparar novo conteúdo");
    } finally {
      setCreating(false);
    }
  }

  const stagesQ = useQuery({
    enabled: !!openPost?.pipeline_id,
    queryKey: ["calendar-stages", openPost?.brand_id, openPost?.client_id, openPost?.pipeline_id],
    queryFn: () =>
      loadBoard({
        data: {
          brandId: openPost!.brand_id,
          clientId: openPost!.client_id,
          pipelineId: openPost!.pipeline_id!,
        },
      }),
  });

  const from = startOfMonth(cursor).toISOString();
  const to = endOfMonth(cursor).toISOString();

  const q = useQuery({
    enabled: !!brandId,
    queryKey: ["calendar", brandId, clientId, from, to],
    queryFn: () =>
      list({ data: { brandId: brandId!, clientId: clientId ?? null, from, to } }),
  });

  const volumetry = useMemo(() => computeVolumetry(q.data ?? []), [q.data]);

  const filteredPosts = useMemo(() => {
    const all = q.data ?? [];
    if (!formatFilter) return all;
    return all.filter((p) => classifyFormat(p.format) === formatFilter);
  }, [q.data, formatFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    filteredPosts.forEach((p) => {
      const k = new Date(p.scheduled_at).toISOString().slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return map;
  }, [filteredPosts]);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  usePageHeader(
    {
      title: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      subtitle: `Publicações agendadas · ${q.data?.length ?? 0} posts no mês`,
      actions: (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCursor((d) => addMonths(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setCursor(startOfMonth(new Date()))}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCursor((d) => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {brandId ? (
            <GeneratePlanDialog
              brandId={brandId}
              clientId={clientId ?? null}
              onGenerated={() => {
                setTimeout(() => qc.invalidateQueries({ queryKey: ["calendar"] }), 1200);
              }}
            />
          ) : null}
        </div>
      ),
    },
    [monthLabel, q.data?.length, brandId, clientId],
  );

  if (!brandId) {
    return (
      <DashboardPageShell>
        <DashboardPanelSurface>
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
            <DashboardIconFrame>
              <CalendarDays className="h-4 w-4" />
            </DashboardIconFrame>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight">Selecione um workspace</div>
              <div className="text-xs text-muted-foreground">
                O calendário editorial é organizado por workspace.
              </div>
            </div>
          </div>
          <PanelEmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            text="Escolha um workspace na barra lateral para visualizar as publicações agendadas."
          />
        </DashboardPanelSurface>
      </DashboardPageShell>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <DashboardPageShell>
      {/* Volumetria */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {volumetry.map((v) => (
          <KpiCard
            key={v.key}
            label={v.label}
            value={v.count}
            sub="no mês"
            tone={FORMAT_TONES[v.key] ?? "neutral"}
            active={formatFilter === v.key}
            dimmed={!!formatFilter && formatFilter !== v.key}
            trailing={formatFilter === v.key ? "Filtro ativo" : undefined}
            onClick={() => setFormatFilter((cur) => (cur === v.key ? null : v.key))}
          />
        ))}
      </section>

      <DashboardPanelSurface>
          <div className="grid grid-cols-7 border-b border-border/60 bg-muted/40 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="px-3 py-3 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(140px,1fr)]">
            {grid.map((day, i) => {
              const key = day.date.toISOString().slice(0, 10);
              const posts = byDay.get(key) ?? [];
              const isCurrentMonth = day.date.getMonth() === cursor.getMonth();
              const isToday = key === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={i}
                  className={cn(
                    "border-b border-r border-border/60 p-2 text-xs transition-colors",
                    "group/day relative",
                    isCurrentMonth ? "hover:bg-muted/30" : "bg-muted/20 text-muted-foreground/50",
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                        isToday
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground/80",
                      )}
                    >
                      {day.date.getDate()}
                    </span>
                    <div className="flex items-center gap-1">
                      {posts.length > 0 ? (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {posts.length}
                        </span>
                      ) : null}
                      {isCurrentMonth ? (
                        <button
                          type="button"
                          onClick={() => handleCreateOnDate(day.date)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border hover:bg-background hover:text-foreground group-hover/day:opacity-100 focus:opacity-100"
                          aria-label={`Novo conteúdo em ${day.date.toLocaleDateString("pt-BR")}`}
                          title="Novo conteúdo neste dia"
                          disabled={creating}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {posts.slice(0, 3).map((p) => (
                      <PostChip key={p.id} post={p} onOpen={handleOpenPost} />
                    ))}
                    {posts.length > 3 ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="block w-full rounded-md px-1.5 py-0.5 pl-0.5 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            +{posts.length - 3} mais
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-2">
                          <div className="mb-2 flex items-center justify-between px-1">
                            <span className="text-xs font-semibold">
                              {day.date.toLocaleDateString("pt-BR", {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                              })}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {posts.length} publicações
                            </span>
                          </div>
                          <div className="space-y-1 max-h-72 overflow-y-auto">
                            {posts.map((p) => (
                              <PostChip key={p.id} post={p} onOpen={handleOpenPost} />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                    {posts.length === 0 && isCurrentMonth ? (
                      <button
                        type="button"
                        onClick={() => handleCreateOnDate(day.date)}
                        disabled={creating}
                        className="flex w-full items-center gap-1 rounded-md border border-dashed border-transparent px-1.5 py-1 text-[10px] text-muted-foreground/70 opacity-0 transition-all hover:border-border hover:text-foreground group-hover/day:opacity-100"
                      >
                        <Plus className="h-3 w-3" /> Adicionar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
      </DashboardPanelSurface>

      <DashboardPanelSurface>
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <DashboardIconFrame>
              <CalendarDays className="h-4 w-4" />
            </DashboardIconFrame>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight">Próximas publicações</div>
              <div className="text-xs text-muted-foreground">
                {filteredPosts.length} {filteredPosts.length === 1 ? "publicação" : "publicações"} no mês
              </div>
            </div>
          </div>
          {formatFilter ? (
            <Badge variant="secondary" className="text-[10px] capitalize">
              {formatFilter}
              <button
                type="button"
                onClick={() => setFormatFilter(null)}
                className="ml-1 opacity-70 hover:opacity-100"
                aria-label="Limpar filtro"
              >
                ×
              </button>
            </Badge>
          ) : null}
        </div>
        {q.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filteredPosts.length === 0 ? (
          <PanelEmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            text={
              formatFilter
                ? `Nenhum post do formato "${formatFilter}" neste mês.`
                : "Nenhum post agendado neste mês. Gere um plano em Produção."
            }
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {filteredPosts.slice(0, 8).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleOpenPost(p)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {new Date(p.scheduled_at).toLocaleString("pt-BR")} · {p.channels?.join(", ")}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {p.review_status ?? "pendente"}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DashboardPanelSurface>

      {openPost && openPost.pipeline_id && stagesQ.data ? (
        <TaskDialog
          mode="edit"
          open={!!openPost}
          onOpenChange={(o) => {
            if (!o) setOpenPost(null);
          }}
          brandId={openPost.brand_id}
          clientId={openPost.client_id}
          pipelineId={openPost.pipeline_id}
          stages={stagesQ.data.stages}
          postId={openPost.post_id}
          invalidateKey={["calendar", brandId, clientId, from, to] as const}
        />
      ) : null}

      {createCtx && clientId ? (
        <TaskDialog
          mode="create"
          open={!!createCtx}
          onOpenChange={(o) => {
            if (!o) setCreateCtx(null);
          }}
          brandId={brandId!}
          clientId={clientId}
          pipelineId={createCtx.pipelineId}
          stages={createCtx.stages}
          defaultScheduledAt={createCtx.date.toISOString()}
          invalidateKey={["calendar", brandId, clientId, from, to] as const}
        />
      ) : null}
    </DashboardPageShell>
    </TooltipProvider>
  );
}

// -- Chip ---------------------------------------------------------------
function PostChip({ post, onOpen }: { post: CalendarPost; onOpen: (p: CalendarPost) => void }) {
  const kind = classifyChannel(post.channels?.[0] ?? "");
  const t = new Date(post.scheduled_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onOpen(post)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-full border px-2 py-1 text-left text-[11px] transition-all hover:-translate-y-px hover:shadow-sm",
            kind.chip,
          )}
          title={post.title}
        >
          <span className="tabular-nums font-semibold opacity-70">{t}</span>
          <span className="truncate flex-1">{post.title}</span>
          {post.author ? (
            <Avatar className="h-4 w-4 ring-1 ring-background">
              {post.author.avatar_url ? (
                <AvatarImage src={post.author.avatar_url} alt={post.author.name ?? ""} />
              ) : null}
              <AvatarFallback className="text-[8px]">
                {(post.author.name ?? "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <div className="font-medium">{post.title}</div>
        <div className="mt-0.5 text-muted-foreground">
          {kind.label} · {t}
          {post.author?.name ? ` · ${post.author.name}` : ""}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

type ChannelKind = {
  key: string;
  label: string;
  chip: string; // pill classes
  dot: string;
  bar: string;
};

const CHANNEL_KINDS: Record<string, ChannelKind> = {
  instagram: {
    key: "instagram",
    label: "Feed",
    chip: "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-300",
    dot: "bg-purple-500",
    bar: "bg-gradient-to-r from-purple-500 to-fuchsia-500",
  },
  stories: {
    key: "stories",
    label: "Stories",
    chip: "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
    dot: "bg-blue-500",
    bar: "bg-gradient-to-r from-blue-500 to-sky-500",
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    chip: "border-cyan-200 bg-cyan-100 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-300",
    dot: "bg-cyan-500",
    bar: "bg-gradient-to-r from-cyan-500 to-teal-500",
  },
  youtube: {
    key: "youtube",
    label: "YouTube",
    chip: "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
    bar: "bg-gradient-to-r from-rose-500 to-red-500",
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    chip: "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
    dot: "bg-sky-500",
    bar: "bg-gradient-to-r from-sky-500 to-blue-600",
  },
  whatsapp: {
    key: "whatsapp",
    label: "WhatsApp",
    chip: "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
    bar: "bg-gradient-to-r from-emerald-500 to-green-600",
  },
  blog: {
    key: "blog",
    label: "Blog",
    chip: "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
    bar: "bg-gradient-to-r from-amber-500 to-orange-500",
  },
  other: {
    key: "other",
    label: "Outros",
    chip: "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-300",
    dot: "bg-zinc-500",
    bar: "bg-gradient-to-r from-zinc-500 to-zinc-400",
  },
};

function classifyChannel(raw: string): ChannelKind {
  const k = (raw ?? "").toLowerCase();
  if (k.includes("story") || k.includes("stories")) return CHANNEL_KINDS.stories;
  if (k.includes("tiktok")) return CHANNEL_KINDS.tiktok;
  if (k.includes("youtube") || k === "yt") return CHANNEL_KINDS.youtube;
  if (k.includes("linkedin")) return CHANNEL_KINDS.linkedin;
  if (k.includes("whats")) return CHANNEL_KINDS.whatsapp;
  if (k.includes("blog")) return CHANNEL_KINDS.blog;
  if (k.includes("insta") || k.includes("feed") || k.includes("facebook") || k === "x" || k.includes("twitter") || k.includes("threads")) {
    return CHANNEL_KINDS.instagram;
  }
  return CHANNEL_KINDS.other;
}

const FORMAT_KINDS: ChannelKind[] = [
  {
    key: "feed",
    label: "Feed",
    chip: "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-300",
    dot: "bg-purple-500",
    bar: "bg-gradient-to-r from-purple-500 to-fuchsia-500",
  },
  {
    key: "stories",
    label: "Stories",
    chip: "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
    dot: "bg-blue-500",
    bar: "bg-gradient-to-r from-blue-500 to-sky-500",
  },
  {
    key: "reels",
    label: "Reels",
    chip: "border-pink-200 bg-pink-100 text-pink-700 dark:border-pink-500/30 dark:bg-pink-500/15 dark:text-pink-300",
    dot: "bg-pink-500",
    bar: "bg-gradient-to-r from-pink-500 to-rose-500",
  },
  {
    key: "carrossel",
    label: "Carrossel",
    chip: "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
    bar: "bg-gradient-to-r from-amber-500 to-orange-500",
  },
];

const FORMAT_TONES: Record<string, KpiTone> = {
  feed: "violet",
  stories: "sky",
  reels: "pink",
  carrossel: "amber",
};

function classifyFormat(raw: string | null | undefined): string | null {
  const k = (raw ?? "").toLowerCase().trim();
  if (!k) return null;
  if (k.includes("stor")) return "stories";
  if (k.includes("reel") || k.includes("short") || k.includes("tiktok") || k.includes("video") || k.includes("vídeo")) return "reels";
  if (k.includes("carro") || k.includes("carousel")) return "carrossel";
  if (k.includes("feed") || k.includes("post") || k.includes("static") || k.includes("imagem") || k.includes("image")) return "feed";
  return "feed";
}

function computeVolumetry(posts: CalendarPost[]) {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const key = classifyFormat(p.format);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return FORMAT_KINDS.map((k) => ({ ...k, count: counts.get(k.key) ?? 0 }));
}

function buildMonthGrid(cursor: Date) {
  const first = startOfMonth(cursor);
  const startWeekday = first.getDay(); // 0=Sun
  const start = new Date(first);
  start.setDate(first.getDate() - startWeekday);
  const cells: { date: Date }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d });
  }
  return cells;
}