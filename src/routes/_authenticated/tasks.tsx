import { useEffect, useMemo, useState } from "react";
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
  ListTodo,
  Kanban,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DashboardPageShell,
  DashboardPanelSurface,
} from "@/components/ui/dashboard-primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { listTasksFn, listProjectsFn } from "@/lib/tasks.functions";
import { listBrandAssigneesFn } from "@/lib/content.functions";
import { listClients } from "@/lib/workspace.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  CreateTaskDialog,
  TaskDrawer,
  isOverdue,
} from "@/components/tasks/shared";
import {
  DEFAULT_VISIBLE_COLUMNS,
  TaskTable,
  type GroupBy,
  type SortDir,
  type SortKey,
  type VisibleColumns,
} from "@/components/tasks/task-table";
import { TaskKanban } from "@/components/tasks/task-kanban";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import {
  DEFAULT_FILTERS,
  TaskToolbar,
  applyFilters,
  type TaskFilters,
} from "@/components/tasks/task-toolbar";
import { Plus } from "lucide-react";

const VIEWS = ["list", "kanban", "calendar", "mine"] as const;
type View = (typeof VIEWS)[number];

const searchSchema = z.object({
  view: z.enum(VIEWS).catch("list"),
  taskId: z.string().uuid().optional(),
  groupBy: z
    .enum(["none", "status", "priority", "project", "client", "assignee"])
    .catch("status"),
  sort: z
    .enum(["title", "assignee", "project", "client", "priority", "status", "due", "created"])
    .catch("created"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  validateSearch: searchSchema,
});

const VIEW_META: Record<View, { label: string; icon: typeof ListTodo }> = {
  list: { label: "Lista", icon: ListTodo },
  kanban: { label: "Kanban", icon: Kanban },
  calendar: { label: "Calendário", icon: CalendarDays },
  mine: { label: "Minhas tarefas", icon: UserIcon },
};

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
  const [filters, setFilters] = useState<TaskFilters>({
    ...DEFAULT_FILTERS,
    search: search.q ?? "",
  });

  const view: View = search.view;
  const groupBy: GroupBy = search.groupBy;
  const sortKey: SortKey = search.sort;
  const sortDir: SortDir = search.dir;
  const openTaskId = search.taskId ?? null;

  function setSearch(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setMe(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const invalidateKey = ["tasks", brandId, clientId] as const;

  const tasksQ = useQuery({
    queryKey: invalidateKey,
    queryFn: () => listTasks({ data: { brandId: brandId!, clientId: clientId ?? null } }),
    enabled: !!brandId,
  });

  const tasks = tasksQ.data ?? [];

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
    queryKey: ["projects", brandId],
    queryFn: () => listProjects({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });

  // Effective filters: "mine" view forces assigneeId=me
  const effectiveFilters: TaskFilters = useMemo(
    () => (view === "mine" ? { ...filters, assigneeId: "me" } : filters),
    [filters, view],
  );

  const filtered = useMemo(
    () => applyFilters(tasks, effectiveFilters, me),
    [tasks, effectiveFilters, me],
  );

  const kpis = useMemo(() => {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    const mine = me ? tasks.filter((t) => t.assignee_id === me && t.status !== "done").length : 0;
    const dueToday = tasks.filter((t) => {
      if (!t.due_at || t.status === "done") return false;
      const time = new Date(t.due_at).getTime();
      return time >= startOfDay.getTime() && time <= endOfDay.getTime();
    }).length;
    return { total, inProgress, done, overdue, mine, dueToday, now };
  }, [tasks, me]);

  usePageHeader(
    {
      title: "Tarefas",
      subtitle: "Trabalho da equipe · atribuições, prazos e discussões",
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

  const invalidate = () => qc.invalidateQueries({ queryKey: invalidateKey });

  return (
    <DashboardPageShell>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total" value={kpis.total} icon={<Circle className="h-4 w-4" />} tone="neutral" />
        <KpiCard
          label="Em andamento"
          value={kpis.inProgress}
          icon={<Clock className="h-4 w-4" />}
          tone="sky"
        />
        <KpiCard
          label="Atrasadas"
          value={kpis.overdue}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
        />
        <KpiCard
          label="Concluídas"
          value={kpis.done}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Minha carga"
          value={kpis.mine}
          icon={<UserIcon className="h-4 w-4" />}
          tone="violet"
        />
        <KpiCard
          label="Prazo hoje"
          value={kpis.dueToday}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="amber"
        />
      </div>

      {/* Views */}
      <Tabs value={view} onValueChange={(v) => setSearch({ view: v as View })}>
        <TabsList className="h-9">
          {VIEWS.map((v) => {
            const meta = VIEW_META[v];
            const Icon = meta.icon;
            return (
              <TabsTrigger key={v} value={v} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

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
        onNewTask={() => setCreateOpen(true)}
        tasksToExport={filtered}
        assignees={assigneesQ.data ?? []}
        clients={clientsQ.data ?? []}
        projects={projectsQ.data ?? []}
      />

      {selectedIds.size > 0 && (
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
      {tasksQ.isLoading ? (
        <DashboardPanelSurface className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando tarefas...
        </DashboardPanelSurface>
      ) : filtered.length === 0 ? (
        <DashboardPanelSurface>
          <PanelEmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            text="Nenhuma tarefa encontrada com os filtros atuais."
          />
          <div className="flex justify-center pb-8">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        </DashboardPanelSurface>
      ) : view === "kanban" ? (
        <TaskKanban tasks={filtered} onOpenTask={(id) => setSearch({ taskId: id })} onChanged={invalidate} />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={filtered} onOpenTask={(id) => setSearch({ taskId: id })} />
      ) : (
        <TaskTable
          brandId={brandId}
          tasks={filtered}
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

      {createOpen ? (
        <CreateTaskDialog
          brandId={brandId}
          clientId={clientId ?? null}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            invalidate();
            setSearch({ taskId: id });
          }}
        />
      ) : null}

      {openTaskId ? (
        <TaskDrawer
          taskId={openTaskId}
          brandId={brandId}
          currentUserId={me}
          allTasks={filtered}
          onNavigate={(id) => setSearch({ taskId: id })}
          onClose={() => setSearch({ taskId: undefined })}
          onChanged={invalidate}
        />
      ) : null}
    </DashboardPageShell>
  );
}

// ---------- Row ----------

