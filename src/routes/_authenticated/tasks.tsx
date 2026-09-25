import { useEffect, useMemo, useState } from "react";
import { ensureFeatureEnabled } from "@/lib/feature-flags.gate";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  CalendarClock,
  User as UserIcon,
  Loader2,
} from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Button } from "@/components/ui/button";
import { DashboardPageShell, DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { PageKpi, PageKpiGrid, type KpiStatus } from "@/components/ui/page-kpi";
import { listTasksFn, listProjectsFn, countMyPendingTasksFn } from "@/lib/tasks.functions";
import { isoDateInTz } from "@/lib/timezone";
import { listBrandAssigneesFn } from "@/lib/content.functions";
import { listClients } from "@/lib/workspace.functions";
import { getCachedUser } from "@/lib/auth-cache";
import { CreateTaskDialog, TaskDrawer, isOverdue } from "@/components/tasks/shared";
import {
  DEFAULT_VISIBLE_COLUMNS,
  TaskTable,
  compare,
  type GroupBy,
  type SortDir,
  type SortKey,
  type VisibleColumns,
} from "@/components/tasks/task-table";
import { TaskKanban } from "@/components/tasks/task-kanban";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { TaskTimeline } from "@/components/tasks/task-timeline";
import { TaskViewSwitcher } from "@/components/tasks/view-switcher";
import {
  DEFAULT_FILTERS,
  TaskToolbar,
  applyFilters,
  type TaskFilters,
} from "@/components/tasks/task-toolbar";
import { Plus } from "lucide-react";

import { searchSchema, type View } from "@/components/tasks/task-views";

export { searchSchema };

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tarefas | Unitos" },
      {
        name: "description",
        content: "Acompanhe suas tarefas e as atividades dos projetos no Unitos.",
      },
      { property: "og:title", content: "Tarefas | Unitos" },
      {
        property: "og:description",
        content: "Acompanhe suas tarefas e as atividades dos projetos no Unitos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => ensureFeatureEnabled("tasks"),
  component: TasksPage,
  validateSearch: searchSchema,
});

// ---------- Style maps ----------

// ---------- Page ----------

function TasksPage() {
  const { brandId, clientId } = useActiveContext();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  const listTasks = useServerFn(listTasksFn);
  const listAssignees = useServerFn(listBrandAssigneesFn);
  const listClientsFn = useServerFn(listClients);
  const listProjects = useServerFn(listProjectsFn);

  const [createOpen, setCreateOpen] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<VisibleColumns>(DEFAULT_VISIBLE_COLUMNS);
  const filters: TaskFilters = {
    search: search.q ?? "",
    status: search.status,
    priority: search.priority,
    assigneeId: search.assigneeId,
    clientId: search.clientId,
    projectId: search.projectId,
    hideDone: search.hideDone,
    due: search.due,
    archive: search.archive,
  };

  const view: View = search.view;
  const groupBy: GroupBy = search.groupBy;
  const sortKey: SortKey = search.sort;
  const sortDir: SortDir = search.dir;
  const openTaskId = search.taskId ?? search.task ?? null;

  type Search = z.infer<typeof searchSchema>;
  function setSearch(patch: Partial<Search>) {
    navigate({
      to: ".",
      search: (prev: Search) => ({ ...prev, ...patch }),
      replace: true,
    });
  }
  function setFilters(next: TaskFilters) {
    setSearch({
      q: next.search || undefined,
      status: next.status,
      priority: next.priority,
      assigneeId: next.assigneeId,
      clientId: next.clientId,
      projectId: next.projectId,
      hideDone: next.hideDone,
      due: next.due,
      archive: next.archive,
    });
  }

  useEffect(() => {
    let cancelled = false;
    getCachedUser().then((user) => {
      if (!cancelled) setMe(user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const assignedToMe = view === "mine";
  // A filter for "me" must use the same workspace-wide scope as "Minhas".
  const workspaceMine = assignedToMe || filters.assigneeId === "me";
  const queryClientId = workspaceMine || filters.clientId !== "all" ? null : (clientId ?? null);
  const invalidateKey = [
    "tasks",
    brandId,
    queryClientId,
    filters.archive,
    workspaceMine,
    me,
  ] as const;

  const tasksQ = useQuery({
    queryKey: invalidateKey,
    queryFn: () =>
      listTasks({
        data: {
          brandId: brandId!,
          clientId: queryClientId,
          archive: filters.archive,
          assignedToMe: workspaceMine,
        },
      }),
    enabled: !!brandId && (!workspaceMine || !!me),
  });

  const countMine = useServerFn(countMyPendingTasksFn);
  const mineQ = useQuery({
    queryKey: ["tasks-pending-count", brandId],
    queryFn: () => countMine({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);

  const assigneesQ = useQuery({
    queryKey: ["brand-assignees", brandId],
    queryFn: () => listAssignees({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });
  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => listClientsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });
  const projectsQ = useQuery({
    queryKey: ["task-projects", brandId],
    queryFn: () => listProjects({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });

  // Effective filters: "mine" view forces assigneeId=me
  const effectiveFilters: TaskFilters = view === "mine" ? { ...filters, assigneeId: "me" } : filters;

  const filtered = useMemo(
    () => applyFilters(tasks, effectiveFilters, me),
    [tasks, search, view, me],
  );
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const result = compare(a, b, sortKey);
    return (sortDir === "asc" ? result : -result) || a.id.localeCompare(b.id);
  }), [filtered, sortKey, sortDir]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    const mine = mineQ.data?.count ?? 0;
    const dueToday = tasks.filter((t) => {
      if (!t.due_at || t.status === "done") return false;
      return isoDateInTz(new Date(t.due_at)) === isoDateInTz();
    }).length;
    const open = tasks.filter((t) => t.status !== "done").length;
    return { total, open, inProgress, done, overdue, mine, dueToday, now };
  }, [tasks, mineQ.data]);

  // ---------- Filtros rápidos (faixa de indicadores) ----------
  type Quick = "open" | "in_progress" | "overdue" | "mine" | "today" | "done";

  const activeQuick: Quick | null = useMemo(() => {
    if (filters.due === "overdue") return "overdue";
    if (filters.due === "today") return "today";
    if (filters.status === "in_progress") return "in_progress";
    if (filters.status === "done") return "done";
    if (filters.assigneeId === "me" && view !== "mine") return "mine";
    if (filters.hideDone) return "open";
    return null;
  }, [search, view]);

  function applyQuick(q: Quick) {
    const base: TaskFilters = {
      ...DEFAULT_FILTERS,
      search: filters.search,
      archive: filters.archive,
    };
    if (activeQuick === q && q !== "mine") {
      setFilters(base);
      return;
    }
    switch (q) {
      case "open":
        setFilters({ ...base, hideDone: true });
        break;
      case "in_progress":
        setFilters({ ...base, status: "in_progress" });
        break;
      case "overdue":
        setFilters({ ...base, due: "overdue" });
        break;
      case "mine":
        setSearch({ view: "mine", assigneeId: "all", clientId: "all", projectId: "all", status: "all", due: "all", hideDone: false });
        break;
      case "today":
        setFilters({ ...base, due: "today" });
        break;
      case "done":
        setFilters({ ...base, status: "done" });
        break;
    }
  }

  usePageHeader(
    {
      title: "Tarefas",
      subtitle: "Organize o trabalho da equipe, acompanhe prazos e avance projetos.",
      actions: brandId ? (
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
        </Button>
      ) : null,
    },
    [brandId],
  );

  if (!brandId) {
    return (
      <DashboardPageShell>
        <DashboardPanelSurface>
          <PanelEmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            text="Selecione uma workspace no seletor lateral para carregar as tarefas."
          />
        </DashboardPanelSurface>
      </DashboardPageShell>
    );
  }

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tasks", brandId] });
    void qc.invalidateQueries({ queryKey: ["tasks-pending-count", brandId] });
  };

  return (
    <DashboardPageShell>
      {/* Resumo operacional — indicadores no padrão único de KPI, que também filtram */}
      <PageKpiGrid columns={6}>
        {(
          [
            { key: "open", label: "Abertas", value: kpis.open, icon: Circle, status: "neutral" },
            {
              key: "in_progress",
              label: "Em andamento",
              value: kpis.inProgress,
              icon: Clock,
              status: "info",
            },
            {
              key: "overdue",
              label: "Atrasadas",
              value: kpis.overdue,
              icon: AlertTriangle,
              status: "danger",
            },
            { key: "mine", label: "Minhas", value: kpis.mine, icon: UserIcon, status: "neutral" },
            {
              key: "today",
              label: "Hoje",
              value: kpis.dueToday,
              icon: CalendarClock,
              status: "warning",
            },
            {
              key: "done",
              label: "Concluídas",
              value: kpis.done,
              icon: CheckCircle2,
              status: "success",
            },
          ] as Array<{
            key: Quick;
            label: string;
            value: number;
            icon: typeof Circle;
            status: KpiStatus;
          }>
        ).map((s) => (
          <PageKpi
            key={s.key}
            label={s.label}
            value={s.value}
            icon={<s.icon />}
            status={s.status === "neutral" || s.value > 0 ? s.status : "neutral"}
            onClick={() => applyQuick(s.key)}
            active={activeQuick === s.key}
          />
        ))}
      </PageKpiGrid>

      {/* Views */}
      <TaskViewSwitcher value={view} onChange={(v) => setSearch({ view: v })} />

      {/* Toolbar */}
      <TaskToolbar
        filters={filters}
        onFiltersChange={(next) => {
          setFilters(next);
          setSearch({ q: next.search || undefined });
        }}
        groupBy={groupBy}
        onGroupByChange={(g) => setSearch({ groupBy: g })}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(k, d) => setSearch({ sort: k, dir: d })}
        columns={columns}
        onColumnsChange={setColumns}
        tasksToExport={sorted}
        assignees={assigneesQ.data ?? []}
        clients={clientsQ.data ?? []}
        projects={projectsQ.data ?? []}
      />

      {selectedIds.size > 0 && view === "list" && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold">{selectedIds.size}</span>
          <span className="text-muted-foreground">selecionada(s)</span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Views body */}
      {tasksQ.isLoading || (workspaceMine && !me) ? (
        <DashboardPanelSurface className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando tarefas...
        </DashboardPanelSurface>
      ) : tasksQ.isError ? (
        <DashboardPanelSurface className="px-6 py-10 text-center text-sm text-destructive" role="alert">
          Não foi possível carregar as tarefas. <Button variant="outline" size="sm" onClick={() => void tasksQ.refetch()}>Tentar novamente</Button>
        </DashboardPanelSurface>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {tasks.length === 0
              ? "Comece criando a primeira tarefa."
              : activeQuick === "overdue"
                ? "Nenhuma tarefa atrasada."
                : "Você não tem tarefas neste filtro."}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            {tasks.length === 0 ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                   setSearch({ q: undefined });
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
      ) : view === "kanban" || view === "board-assignee" ? (
        <TaskKanban
          tasks={sorted}
          groupMode={view === "board-assignee" ? "assignee" : "status"}
          onOpenTask={(id) => setSearch({ taskId: id })}
          onChanged={invalidate}
        />
      ) : view === "timeline" ? (
        <TaskTimeline tasks={sorted} onOpenTask={(id) => setSearch({ taskId: id })} />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={sorted} onOpenTask={(id) => setSearch({ taskId: id })} />
      ) : (
        <TaskTable
          brandId={brandId}
          tasks={sorted}
          columns={columns}
          groupBy={groupBy}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(k) =>
            setSearch({ sort: k, dir: sortKey === k && sortDir === "asc" ? "desc" : "asc" })
          }
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onOpenTask={(id) => setSearch({ taskId: id })}
          onChanged={invalidate}
        />
      )}

      {!tasksQ.isLoading && !tasksQ.isError && tasks.length > 0 ? (
        <p className="text-center text-[11px] text-muted-foreground">
          Exibindo {filtered.length} de {tasks.length} tarefa{tasks.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {createOpen ? (
        <CreateTaskDialog
          brandId={brandId}
          clientId={clientId ?? null}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
             invalidate();
             void qc.invalidateQueries({ queryKey: ["tasks-pending-count", brandId] });
            setSearch({ taskId: id });
          }}
        />
      ) : null}

      {openTaskId ? (
        <TaskDrawer
          taskId={openTaskId}
          brandId={brandId}
          currentUserId={me}
          allTasks={sorted}
          onNavigate={(id) => setSearch({ taskId: id })}
          onClose={() => setSearch({ taskId: undefined })}
          onChanged={invalidate}
        />
      ) : null}
    </DashboardPageShell>
  );
}

// ---------- Row ----------
