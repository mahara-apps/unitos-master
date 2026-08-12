import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Plus, ChevronDown, CalendarClock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useActiveContext } from "@/hooks/use-active-context";
import { listScheduledPostsFn, type CalendarPost } from "@/lib/calendar.functions";
import { listCalendarEventsFn, type CalendarEvent } from "@/lib/calendar-events.functions";
import { usePageHeader } from "@/hooks/use-page-header";
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
import { ScheduleWizard, type WizardSeed } from "@/components/calendar/schedule-wizard";
import { PendingSchedulePanel } from "@/components/calendar/pending-schedule-panel";
import { EventChip, type UnifiedEvent } from "@/components/calendar/event-chip";
import { EventDialog } from "@/components/calendar/event-dialog";
import { SocialIconsRow } from "@/components/calendar/social-icons-row";
import {
  uniqueNetworks,
  SOCIAL_NETWORKS,
  classifySocialNetwork,
  type SocialNetworkKey,
} from "@/lib/calendar-tokens";
import { describeError } from "@/lib/errors";

const searchSchema = z.object({
  channels: z.array(z.string()).optional(),
  format: z.string().nullable().optional(),
});

export const Route = createFileRoute("/_authenticated/calendar")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: CalendarPage,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-lg space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
      <div className="font-semibold text-destructive">Não foi possível carregar o calendário.</div>
      <div className="text-muted-foreground">{describeError(error)}</div>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Tentar novamente
      </button>
    </div>
  ),
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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const formatFilter = search.format ?? null;
  const channelFilter = useMemo<SocialNetworkKey[]>(
    () => (search.channels ?? []).map((c) => classifySocialNetwork(c)),
    [search.channels],
  );

  function setFormatFilter(next: string | null) {
    navigate({ search: (prev) => ({ ...prev, format: next ?? undefined }), replace: true });
  }
  function toggleChannel(key: SocialNetworkKey) {
    const cur = new Set(channelFilter);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    const arr = Array.from(cur);
    navigate({
      search: (prev) => ({ ...prev, channels: arr.length ? arr : undefined }),
      replace: true,
    });
  }
  function clearChannels() {
    navigate({ search: (prev) => ({ ...prev, channels: undefined }), replace: true });
  }
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<WizardSeed | null>(null);
  const [wizardDate, setWizardDate] = useState<Date | null>(null);
  const list = useServerFn(listScheduledPostsFn);
  const listEvents = useServerFn(listCalendarEventsFn);
  const qc = useQueryClient();
  const [openPost, setOpenPost] = useState<CalendarPost | null>(null);
  const [openingPost, setOpeningPost] = useState(false);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [newEventCtx, setNewEventCtx] = useState<
    | { type: "appointment" | "seasonal"; date: Date | null }
    | null
  >(null);
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
        toast.error(describeError(e));
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
      toast.error(describeError(e));
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

  const eventsQ = useQuery({
    enabled: !!brandId,
    queryKey: ["calendar-events", brandId, clientId, from, to],
    queryFn: () =>
      listEvents({ data: { brandId: brandId!, clientId: clientId ?? null, from, to } }),
  });

  /** Networks present in the month, with counts — drives the dynamic channel chips. */
  const channelOptions = useMemo(() => {
    const counts = new Map<SocialNetworkKey, number>();
    (q.data ?? []).forEach((p) => {
      uniqueNetworks(p.channels ?? []).forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count, label: SOCIAL_NETWORKS[key].label }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [q.data]);

  const channelFilteredPosts = useMemo(() => {
    const all = q.data ?? [];
    if (channelFilter.length === 0) return all;
    const wanted = new Set(channelFilter);
    return all.filter((p) => uniqueNetworks(p.channels ?? []).some((k) => wanted.has(k)));
  }, [q.data, channelFilter]);

  const volumetry = useMemo(() => computeVolumetry(channelFilteredPosts), [channelFilteredPosts]);

  const filteredPosts = useMemo(() => {
    if (!formatFilter) return channelFilteredPosts;
    return channelFilteredPosts.filter((p) => classifyFormat(p.format) === formatFilter);
  }, [channelFilteredPosts, formatFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    filteredPosts.forEach((p) => {
      const k = new Date(p.scheduled_at).toISOString().slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ kind: "post", data: p });
    });
    (eventsQ.data ?? []).forEach((e) => {
      const k = new Date(e.starts_at).toISOString().slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ kind: "event", data: e });
    });
    // sort each day by time
    for (const [, items] of map) {
      items.sort((a, b) => {
        const at = a.kind === "post" ? a.data.scheduled_at : a.data.starts_at;
        const bt = b.kind === "post" ? b.data.scheduled_at : b.data.starts_at;
        return new Date(at).getTime() - new Date(bt).getTime();
      });
    }
    return map;
  }, [filteredPosts, eventsQ.data]);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const visibleGrid = useMemo(() => {
    if (viewMode === "month") return grid;
    // week view: pega a semana contendo hoje (ou 1º dia do mês se fora)
    const today = new Date();
    const anchor =
      today.getMonth() === cursor.getMonth() && today.getFullYear() === cursor.getFullYear()
        ? today
        : cursor;
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - anchor.getDay());
    start.setHours(0, 0, 0, 0);
    const days: typeof grid = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({ date: d });
    }
    return days;
  }, [grid, viewMode, cursor]);

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  usePageHeader(
    {
      title: "Calendário",
      subtitle: (() => {
        const total = q.data?.length ?? 0;
        const shown = filteredPosts.length;
        const label =
          shown !== total
            ? `${shown} de ${total} publicações confirmadas`
            : `${total} publicações confirmadas`;
        return `${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)} · ${label}`;
      })(),
      actions: (
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border/60 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                viewMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Mês
            </button>
          </div>
          <div className="flex items-center rounded-md border border-border/60">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setCursor((d) => addMonths(d, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-9 rounded-none border-x border-border/60" onClick={() => { setCursor(startOfMonth(new Date())); setViewMode("month"); }}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setCursor((d) => addMonths(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {brandId ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9 gap-1.5">
                  <Plus className="h-4 w-4" /> Novo
                  <ChevronDown className="ml-0.5 h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {clientId ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setWizardSeed(null);
                      setWizardDate(null);
                      setWizardOpen(true);
                    }}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" /> Agendar publicação
                  </DropdownMenuItem>
                ) : null}
                {clientId ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  onClick={() => setNewEventCtx({ type: "appointment", date: null })}
                >
                  <CalendarDays className="mr-2 h-4 w-4" /> Novo compromisso
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setNewEventCtx({ type: "seasonal", date: null })}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Nova data sazonal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ),
    },
    [monthLabel, q.data?.length, brandId, clientId, viewMode],
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
      {q.isError || eventsQ.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {describeError(q.error ?? eventsQ.error)}
        </div>
      ) : null}
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
            onClick={() => setFormatFilter(formatFilter === v.key ? null : v.key)}
          />
        ))}
      </section>

      {/* Filtros dinâmicos por canal/rede social */}
      {channelOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Canais
          </span>
          {channelOptions.map((opt) => {
            const Icon = SOCIAL_NETWORKS[opt.key].Icon;
            const active = channelFilter.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleChannel(opt.key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {opt.label}
                <span className="tabular-nums opacity-70">{opt.count}</span>
              </button>
            );
          })}
          {channelFilter.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearChannels}>
              Limpar
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <DashboardPanelSurface>
          <div className="grid grid-cols-7 border-b border-border/60 bg-muted/40 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="px-3 py-3 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(140px,1fr)]">
            {visibleGrid.map((day, i) => {
              const key = day.date.toISOString().slice(0, 10);
              const items = byDay.get(key) ?? [];
              const postItems = items.filter((it) => it.kind === "post") as Extract<UnifiedEvent, { kind: "post" }>[];
              const networks = uniqueNetworks(postItems.flatMap((it) => it.data.channels ?? []));
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
                    <div className="flex items-center gap-1.5 min-w-0">
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
                      {networks.length > 0 ? (
                        <SocialIconsRow networks={networks} max={4} size="xs" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {items.length > 0 ? (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {items.length}
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
                    {items.slice(0, 3).map((it) => (
                      <EventChip
                        key={it.kind + ":" + it.data.id}
                        item={it}
                        onOpen={(x) => {
                          if (x.kind === "post") handleOpenPost(x.data);
                          else setOpenEvent(x.data);
                        }}
                      />
                    ))}
                    {items.length > 3 ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="block w-full rounded-md px-1.5 py-0.5 pl-0.5 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            +{items.length - 3} mais
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
                              {items.length} eventos
                            </span>
                          </div>
                          <div className="space-y-1 max-h-72 overflow-y-auto">
                            {items.map((it) => (
                              <EventChip
                                key={it.kind + ":" + it.data.id}
                                item={it}
                                onOpen={(x) => {
                                  if (x.kind === "post") handleOpenPost(x.data);
                                  else setOpenEvent(x.data);
                                }}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                    {items.length === 0 && isCurrentMonth ? (
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
        {brandId && clientId ? (
          <div className="flex flex-col gap-4">
            <PendingSchedulePanel
              brandId={brandId}
              clientId={clientId}
              onPick={(p) => {
                setWizardSeed({
                  postId: p.postId,
                  title: p.title,
                  copy: p.copy,
                  coverUrl: p.coverUrl,
                  targetConnectionIds: p.targetConnectionIds,
                });
                setWizardDate(null);
                setWizardOpen(true);
              }}
            />
            <PendingSchedulePanel
              mode="drafts"
              brandId={brandId}
              clientId={clientId}
              onPick={(p) => {
                setWizardSeed({
                  postId: p.postId,
                  title: p.title,
                  copy: p.copy,
                  coverUrl: p.coverUrl,
                  targetConnectionIds: p.targetConnectionIds,
                });
                setWizardDate(null);
                setWizardOpen(true);
              }}
            />
          </div>
        ) : null}
      </div>

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
                : "Nenhuma publicação agendada ou publicada neste mês."
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
                  <Badge variant={p.status === "published" ? "default" : "outline"}>
                    {p.status === "published" ? "Publicado" : "Agendado"}
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

      {brandId && clientId ? (
        <ScheduleWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          brandId={brandId}
          clientId={clientId}
          seed={wizardSeed}
          defaultDate={wizardDate}
        />
      ) : null}

      {brandId && (openEvent || newEventCtx) ? (
        <EventDialog
          open={!!(openEvent || newEventCtx)}
          onOpenChange={(o) => {
            if (!o) {
              setOpenEvent(null);
              setNewEventCtx(null);
            }
          }}
          brandId={brandId}
          clientId={clientId ?? null}
          event={openEvent ?? undefined}
          defaultType={newEventCtx?.type ?? "appointment"}
          defaultDate={newEventCtx?.date ?? null}
          invalidateKey={["calendar-events", brandId, clientId, from, to] as const}
        />
      ) : null}
    </DashboardPageShell>
    </TooltipProvider>
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
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  stories: {
    key: "stories",
    label: "Stories",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
  },
  youtube: {
    key: "youtube",
    label: "YouTube",
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  whatsapp: {
    key: "whatsapp",
    label: "WhatsApp",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  blog: {
    key: "blog",
    label: "Blog",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  other: {
    key: "other",
    label: "Outros",
    chip: "border-border/60 bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
    bar: "bg-muted-foreground/60",
  },
};

const FORMAT_KINDS: ChannelKind[] = [
  {
    key: "feed",
    label: "Feed",
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  {
    key: "stories",
    label: "Stories",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  {
    key: "reels",
    label: "Reels",
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
  },
  {
    key: "carrossel",
    label: "Carrossel",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
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