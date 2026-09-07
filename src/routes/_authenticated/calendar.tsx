import { useMemo, useState } from "react";
import { ensureFeatureEnabled } from "@/lib/feature-flags.gate";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  LayoutList,
  Loader2,
  Plus,
  Rows3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/errors";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import {
  DashboardPageShell,
  DashboardPanelSurface,
  DashboardIconFrame,
} from "@/components/ui/dashboard-primitives";
import { listPublicationBoardFn, type PublicationItem } from "@/lib/calendar-board.functions";
import { listCalendarEventsFn, type CalendarEvent } from "@/lib/calendar-events.functions";
import { listDraftsFn, type PendingSchedulePost } from "@/lib/scheduling-wizard.functions";
import { ScheduleWizard, type WizardSeed } from "@/components/calendar/schedule-wizard";
import { EventDialog } from "@/components/calendar/event-dialog";
import { EventChip } from "@/components/calendar/event-chip";
import { PublicationCard, PublicationRow } from "@/components/calendar/board/publication-card";
import { OperationsPanel } from "@/components/calendar/board/operations-panel";
import { ScheduleApprovalPanel } from "@/components/calendar/board/schedule-approval-panel";
import { UndatedTray } from "@/components/calendar/board/undated-tray";
import { DraftsDrawer } from "@/components/calendar/board/drafts-drawer";
import { BulkApplyDialog } from "@/components/calendar/board/bulk-apply-dialog";

import {
  listUndatedPostsFn,
  suggestSchedulesFn,
  updateScheduleSlotFn,
} from "@/lib/schedule-approval.functions";
import { PublicationDetailModal } from "@/components/calendar/board/publication-detail";
import {
  StatusFilterBar,
  SecondaryFilters,
  type StatusFilter,
} from "@/components/calendar/board/status-filter-bar";
import { dayLabel, formatLabel, relativeLabel } from "@/lib/publication-status-tokens";
import {
  SOCIAL_NETWORKS,
  classifySocialNetwork,
  type SocialNetworkKey,
} from "@/lib/calendar-tokens";
import { normalizeContentFormat } from "@/lib/content-formats";

export const Route = createFileRoute("/_authenticated/calendar")({
  beforeLoad: () => ensureFeatureEnabled("calendar"),
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

// ---------------------------------------------------------------- date helpers
const DAY = 86_400_000;
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------- page
type Range = "week" | "month";
type View = "agenda" | "list";

function CalendarPage() {
  const { brandId, clientId } = useActiveContext();
  const qc = useQueryClient();

  const [range, setRange] = useState<Range>("month");
  const [view, setView] = useState<View>("agenda");
  const [anchor, setAnchor] = useState(() => new Date());
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<SocialNetworkKey[]>([]);
  const [formatFilter, setFormatFilter] = useState<string | null>(null);

  const [pendingUndated, setPendingUndated] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<WizardSeed | null>(null);
  const [wizardDate, setWizardDate] = useState<Date | null>(null);
  // Fila de rascunhos: índice do item aberto no wizard (setas anterior/próximo).
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  // Seleção múltipla para ações em massa.
  const [selectedDrafts, setSelectedDrafts] = useState<string[]>([]);
  const [draftsDrawerOpen, setDraftsDrawerOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [detail, setDetail] = useState<PublicationItem | null>(null);

  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [newEventCtx, setNewEventCtx] = useState<{
    type: "appointment" | "seasonal";
    date: Date | null;
  } | null>(null);

  // Janela consultada — somente o período visível (nada de histórico inteiro).
  const { from, to, days } = useMemo(() => {
    if (range === "week") {
      const start = startOfWeek(anchor);
      const list = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
      const end = new Date(list[6]!);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString(), days: list };
    }
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const list = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY));
    const end = new Date(list[41]!);
    end.setHours(23, 59, 59, 999);
    return {
      from: startOfMonth(anchor) < gridStart ? gridStart.toISOString() : gridStart.toISOString(),
      to: end.toISOString(),
      days: list,
    };
  }, [range, anchor]);

  const loadBoard = useServerFn(listPublicationBoardFn);
  const listEvents = useServerFn(listCalendarEventsFn);
  const listDrafts = useServerFn(listDraftsFn);

  const boardQ = useQuery({
    enabled: !!brandId,
    queryKey: ["publication-board", brandId, clientId, from, to],
    queryFn: () => loadBoard({ data: { brandId: brandId!, clientId: clientId ?? null, from, to } }),
    staleTime: 30_000,
  });

  const eventsQ = useQuery({
    enabled: !!brandId,
    queryKey: ["calendar-events", brandId, clientId, from, to],
    queryFn: () =>
      listEvents({ data: { brandId: brandId!, clientId: clientId ?? null, from, to } }),
    staleTime: 60_000,
  });

  const draftsQ = useQuery({
    enabled: !!brandId,
    queryKey: ["calendar-drafts", brandId, clientId],
    queryFn: () => listDrafts({ data: { brandId: brandId!, clientId: clientId ?? null } }),
    staleTime: 60_000,
  });

  const loadUndated = useServerFn(listUndatedPostsFn);
  const updateSlot = useServerFn(updateScheduleSlotFn);
  const suggestSchedules = useServerFn(suggestSchedulesFn);

  const undatedQ = useQuery({
    enabled: !!brandId,
    queryKey: ["calendar-undated", brandId, clientId],
    queryFn: () => loadUndated({ data: { brandId: brandId!, clientId: clientId ?? null } }),
    staleTime: 30_000,
  });

  const invalidateSchedule = () => {
    void qc.invalidateQueries({ queryKey: ["publication-board"] });
    void qc.invalidateQueries({ queryKey: ["calendar-undated"] });
    void qc.invalidateQueries({ queryKey: ["calendar-drafts"] });
  };

  const suggestMut = useMutation({
    mutationFn: () =>
      suggestSchedules({
        data: { brandId: brandId!, clientId: clientId!, monthAnchor: anchor.toISOString() },
      }),
    onSuccess: (res) => {
      invalidateSchedule();
      toast.success(
        res.updated > 0
          ? `${res.updated} peça(s) receberam agenda sugerida.`
          : "Nenhuma peça sem data para sugerir.",
      );
    },
    onError: (e) => toast.error(describeError(e)),
  });

  const assignMut = useMutation({
    mutationFn: (vars: { postId: string; proposedAt: string }) =>
      updateSlot({
        data: {
          brandId: brandId!,
          clientId: clientId!,
          postId: vars.postId,
          proposedAt: vars.proposedAt,
        },
      }),
    onSuccess: () => {
      setPendingUndated(null);
      invalidateSchedule();
      toast.success("Data proposta. Aprove a agenda para reservar.");
    },
    onError: (e) => toast.error(describeError(e)),
  });

  /** Clique num dia: posiciona a peça selecionada ou abre a criação. */
  const handleDayAdd = (d: Date) => {
    if (pendingUndated && clientId) {
      const at = new Date(d);
      at.setHours(19, 0, 0, 0);
      assignMut.mutate({ postId: pendingUndated, proposedAt: at.toISOString() });
      return;
    }
    newPublication(d);
  };

  const items = useMemo(() => boardQ.data?.items ?? [], [boardQ.data]);
  const awaiting = useMemo(() => boardQ.data?.awaitingApproval ?? [], [boardQ.data]);
  const drafts = draftsQ.data ?? [];

  // ----------------------------------------------------------------- filtros
  const channelOptions = useMemo(() => {
    const counts = new Map<SocialNetworkKey, number>();
    for (const it of items) {
      const nets = new Set(
        (it.destinations.length ? it.destinations.map((d) => d.channel) : it.channels).map((c) =>
          classifySocialNetwork(c),
        ),
      );
      nets.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count, label: SOCIAL_NETWORKS[key].label }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [items]);

  const formatOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      new Set(it.formats.map((f) => normalizeContentFormat(f) ?? f)).forEach((f) =>
        counts.set(f, (counts.get(f) ?? 0) + 1),
      );
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count, label: formatLabel(key) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [items]);

  const counts = useMemo(
    () => ({
      all: items.length,
      scheduled: items.filter((i) => i.overall === "scheduled" || i.overall === "publishing")
        .length,
      awaiting_approval: awaiting.length,
      proposed: items.filter((i) => i.overall === "proposed").length,
      published: items.filter((i) => i.overall === "published").length,
      failed: items.filter((i) => i.overall === "failed" || i.overall === "partial").length,
      drafts: drafts.length,
    }),
    [items, awaiting.length, drafts.length],
  );

  const filtered = useMemo(() => {
    let list = items;
    if (status === "proposed") list = list.filter((i) => i.overall === "proposed");
    else if (status === "scheduled")
      list = list.filter((i) => i.overall === "scheduled" || i.overall === "publishing");
    else if (status === "published") list = list.filter((i) => i.overall === "published");
    else if (status === "failed")
      list = list.filter((i) => i.overall === "failed" || i.overall === "partial");
    else if (status === "awaiting_approval")
      list = list.filter((i) => i.overall === "awaiting_approval");
    else if (status === "drafts")
      list = list.filter((i) => i.overall === "draft" || i.overall === "ready");

    if (channelFilter.length)
      list = list.filter((i) =>
        (i.destinations.length ? i.destinations.map((d) => d.channel) : i.channels).some((c) =>
          channelFilter.includes(classifySocialNetwork(c)),
        ),
      );
    if (formatFilter)
      list = list.filter((i) =>
        i.formats.some((f) => (normalizeContentFormat(f) ?? f) === formatFilter),
      );
    return list;
  }, [items, status, channelFilter, formatFilter]);

  const byDay = useMemo(() => {
    const map = new Map<
      string,
      Array<{ kind: "post"; data: PublicationItem } | { kind: "event"; data: CalendarEvent }>
    >();
    for (const it of filtered) {
      if (!it.when) continue;
      const k = dayKey(new Date(it.when));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ kind: "post", data: it });
    }
    for (const e of eventsQ.data ?? []) {
      const k = dayKey(new Date(e.starts_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ kind: "event", data: e });
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const at = a.kind === "post" ? (a.data.when ?? "") : a.data.starts_at;
        const bt = b.kind === "post" ? (b.data.when ?? "") : b.data.starts_at;
        return at.localeCompare(bt);
      });
    }
    return map;
  }, [filtered, eventsQ.data]);

  // ------------------------------------------------------------ painel direito
  const nowIso = new Date().toISOString();
  const upcoming = useMemo(
    () =>
      items
        .filter(
          (i) =>
            (i.overall === "scheduled" || i.overall === "publishing") && (i.when ?? "") >= nowIso,
        )
        .sort((a, b) => (a.when ?? "").localeCompare(b.when ?? "")),
    [items, nowIso],
  );

  const failures = useMemo(
    () =>
      items
        .filter((i) => i.overall === "failed" || i.overall === "partial")
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [items],
  );

  const attention = useMemo(() => {
    const seen = new Set<string>();
    const out: PublicationItem[] = [];
    for (const it of [...failures, ...awaiting, ...items.filter((i) => i.overall === "ready")]) {
      if (seen.has(it.postId)) continue;
      seen.add(it.postId);
      out.push(it);
    }
    return out;
  }, [failures, awaiting, items]);

  // --------------------------------------------------------------- interações
  function openDetail(item: PublicationItem) {
    setDetail(item);
  }
  function openWizardForPost(item: PublicationItem) {
    setDetail(null);
    setQueueIndex(null);
    setWizardSeed({ postId: item.postId });
    setWizardDate(null);
    setWizardOpen(true);
  }
  function seedFromDraft(d: PendingSchedulePost): WizardSeed {
    return {
      postId: d.postId,
      title: d.title,
      copy: d.copy,
      coverUrl: d.coverUrl,
      targetConnectionIds: d.targetConnectionIds,
    };
  }
  function openWizardForDraft(d: PendingSchedulePost, index?: number) {
    const i = index ?? drafts.findIndex((x) => x.postId === d.postId);
    setQueueIndex(i >= 0 ? i : null);
    setWizardSeed(seedFromDraft(d));
    setWizardDate(null);
    setWizardOpen(true);
  }
  /** Setas do wizard: troca a peça em edição sem fechar o modal. */
  function navigateQueue(index: number) {
    const next = drafts[index];
    if (!next) return;
    setQueueIndex(index);
    setWizardSeed(seedFromDraft(next));
  }
  function toggleDraftSelection(postId: string) {
    setSelectedDrafts((prev) =>
      prev.includes(postId) ? prev.filter((x) => x !== postId) : [...prev, postId],
    );
  }
  function newPublication(date?: Date) {
    setQueueIndex(null);
    setWizardSeed(null);
    setWizardDate(date ?? null);
    setWizardOpen(true);
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["publication-board"] });
    qc.invalidateQueries({ queryKey: ["calendar-drafts"] });
  }

  const periodLabel =
    range === "week"
      ? `${days[0]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${days[6]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
      : anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  usePageHeader(
    {
      title: "Calendário",
      subtitle: "Planeje, acompanhe e gerencie suas publicações.",
      actions: (
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border/60 p-0.5">
            <button
              type="button"
              onClick={() => setView("agenda")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                view === "agenda"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Rows3 className="h-3.5 w-3.5" /> Agenda
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutList className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
          <div className="flex items-center rounded-md border border-border/60 p-0.5">
            {(["week", "month"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium transition-colors",
                  range === r
                    ? "bg-muted text-foreground ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r === "week" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-md border border-border/60">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-r-none"
              aria-label="Período anterior"
              onClick={() =>
                setAnchor((d) =>
                  range === "week"
                    ? new Date(d.getTime() - 7 * DAY)
                    : new Date(d.getFullYear(), d.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-none border-x border-border/60"
              onClick={() => setAnchor(new Date())}
            >
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-l-none"
              aria-label="Próximo período"
              onClick={() =>
                setAnchor((d) =>
                  range === "week"
                    ? new Date(d.getTime() + 7 * DAY)
                    : new Date(d.getFullYear(), d.getMonth() + 1, 1),
                )
              }
            >
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
                  <DropdownMenuItem onClick={() => newPublication()}>
                    <CalendarClock className="mr-2 h-4 w-4" /> Nova publicação
                  </DropdownMenuItem>
                ) : null}
                {clientId ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  onClick={() => setNewEventCtx({ type: "appointment", date: null })}
                >
                  <CalendarDays className="mr-2 h-4 w-4" /> Novo compromisso
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNewEventCtx({ type: "seasonal", date: null })}>
                  <Sparkles className="mr-2 h-4 w-4" /> Nova data sazonal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ),
    },
    [view, range, brandId, clientId, periodLabel],
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
                A central de publicação é organizada por workspace.
              </div>
            </div>
          </div>
          <PanelEmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            text="Escolha um workspace na barra lateral para visualizar as publicações."
          />
        </DashboardPanelSurface>
      </DashboardPageShell>
    );
  }

  const emptyAgenda = filtered.length === 0 && (eventsQ.data ?? []).length === 0;

  return (
    <TooltipProvider delayDuration={200}>
      <DashboardPageShell>
        {boardQ.isError || eventsQ.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {describeError(boardQ.error ?? eventsQ.error)}
          </div>
        ) : null}

        <div className="space-y-2">
          <StatusFilterBar counts={counts} value={status} onChange={setStatus} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SecondaryFilters
              channelOptions={channelOptions}
              channelFilter={channelFilter}
              onToggleChannel={(k) =>
                setChannelFilter((cur) =>
                  cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k],
                )
              }
              onClearChannels={() => setChannelFilter([])}
              formatOptions={formatOptions}
              formatFilter={formatFilter}
              onFormat={setFormatFilter}
            />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {boardQ.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              <span className="font-medium capitalize">{periodLabel}</span>
            </div>
          </div>
        </div>

        {brandId ? (
          <UndatedTray
            items={undatedQ.data ?? []}
            loading={undatedQ.isLoading}
            selectedId={pendingUndated}
            onSelect={setPendingUndated}
            onSuggest={() => suggestMut.mutate()}
            suggesting={suggestMut.isPending}
            canSuggest={!!clientId}
          />
        ) : null}

        {brandId && clientId ? (
          <ScheduleApprovalPanel
            brandId={brandId}
            clientId={clientId}
            items={items}
            onOpen={openDetail}
          />
        ) : null}


        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ---------------------------------------------------- AGENDA / LISTA */}
          {view === "list" ? (
            <ListView
              items={filtered}
              drafts={status === "drafts" ? drafts : []}
              loading={boardQ.isLoading}
              onOpen={openDetail}
              onOpenDraft={openWizardForDraft}
              onNew={clientId ? () => newPublication() : undefined}
            />
          ) : range === "week" ? (
            <WeekView
              days={days}
              byDay={byDay}
              loading={boardQ.isLoading}
              empty={emptyAgenda}
              onOpen={openDetail}
              onOpenEvent={setOpenEvent}
              onNewOnDay={clientId ? handleDayAdd : undefined}
            />
          ) : (
            <MonthView
              days={days}
              anchorMonth={anchor.getMonth()}
              byDay={byDay}
              loading={boardQ.isLoading}
              empty={emptyAgenda}
              onOpen={openDetail}
              onOpenEvent={setOpenEvent}
              onNewOnDay={clientId ? handleDayAdd : undefined}
            />
          )}

          {/* ------------------------------------------------- PAINEL OPERACIONAL */}
          <OperationsPanel
            upcoming={upcoming}
            attention={attention}
            failures={failures}
            drafts={drafts}
            draftsLoading={draftsQ.isLoading}
            selectedDrafts={selectedDrafts}
            onToggleDraft={toggleDraftSelection}
            onBulkDrafts={selectedDrafts.length ? () => setBulkOpen(true) : undefined}
            onOpen={openDetail}
            onOpenDraft={openWizardForDraft}
            onSeeAllDrafts={() => setDraftsDrawerOpen(true)}
          />
        </div>
      </DashboardPageShell>

      <PublicationDetailModal
        item={detail}
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        onEdit={openWizardForPost}
        onChanged={refresh}
      />

      <DraftsDrawer
        open={draftsDrawerOpen}
        onOpenChange={setDraftsDrawerOpen}
        drafts={drafts}
        loading={draftsQ.isLoading}
        selected={selectedDrafts}
        onToggle={toggleDraftSelection}
        onSelectMany={setSelectedDrafts}
        onOpenDraft={(d, i) => {
          setDraftsDrawerOpen(false);
          openWizardForDraft(d, i);
        }}
        onBulk={() => setBulkOpen(true)}
      />

      {brandId && clientId ? (
        <BulkApplyDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          brandId={brandId}
          clientId={clientId}
          postIds={selectedDrafts}
          monthAnchor={anchor}
          onApplied={() => setSelectedDrafts([])}
        />
      ) : null}

      {brandId && clientId ? (
        <ScheduleWizard
          open={wizardOpen}
          onOpenChange={(v) => {
            setWizardOpen(v);
            if (!v) {
              setWizardSeed(null);
              setWizardDate(null);
              setQueueIndex(null);
            }
          }}
          brandId={brandId}
          clientId={clientId}
          seed={wizardSeed ?? undefined}
          defaultDate={wizardDate ?? undefined}
          onSaved={refresh}
          queueTotal={queueIndex !== null ? drafts.length : undefined}
          queueIndex={queueIndex ?? undefined}
          onQueueNavigate={queueIndex !== null ? navigateQueue : undefined}
        />
      ) : null}


      {openEvent ? (
        <EventDialog
          open={!!openEvent}
          onOpenChange={(v) => !v && setOpenEvent(null)}
          brandId={brandId}
          clientId={clientId ?? null}
          event={openEvent}
          invalidateKey={["calendar-events", brandId, clientId, from, to]}
        />
      ) : null}
      {newEventCtx ? (
        <EventDialog
          open={!!newEventCtx}
          onOpenChange={(v) => !v && setNewEventCtx(null)}
          brandId={brandId}
          clientId={clientId ?? null}
          defaultType={newEventCtx.type}
          defaultDate={newEventCtx.date ?? undefined}
          invalidateKey={["calendar-events", brandId, clientId, from, to]}
        />
      ) : null}
    </TooltipProvider>
  );
}

