import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { PlanStatusBadge } from "@/lib/monthly-plan-status";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { usePageHeader } from "@/hooks/use-page-header";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients } from "@/lib/workspace.functions";
import { listBrandTeam } from "@/lib/team.functions";
import {
  archiveProject,
  deleteProject,
  getProject,
  updateProject,
} from "@/lib/projects.functions";
import {
  listPipelinesFn,
  ensureDefaultPipelineFn,
  loadBoardFn,
} from "@/lib/content.functions";
import { TaskDialog } from "@/components/content/task-dialog";
import {
  DashboardPageShell,
  DashboardPanelSurface,
} from "@/components/ui/dashboard-primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { JobsPanel } from "@/components/projects/jobs-panel";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectDetailPage,
});

const COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#3b82f6",
  "#6366f1",
  "#ef4444",
  "#14b8a6",
  "#f59e0b",
  "#06b6d4",
];

const STATUS_OPTIONS = [
  { value: "planning", label: "Planejamento" },
  { value: "active", label: "Ativa" },
  { value: "in_progress", label: "Em execução" },
  { value: "paused", label: "Pausada" },
  { value: "done", label: "Concluída" },
];

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { brandId } = useActiveContext();
  const navigate = useNavigate();
  const [openNewTask, setOpenNewTask] = useState(false);
  function goCreateItem() {
    setOpenNewTask(true);
  }

  const qc = useQueryClient();

  const get = useServerFn(getProject);
  const upd = useServerFn(updateProject);
  const arch = useServerFn(archiveProject);
  const del = useServerFn(deleteProject);
  const clientsFn = useServerFn(listClients);
  const teamFn = useServerFn(listBrandTeam);
  const listPipes = useServerFn(listPipelinesFn);
  const ensureDefault = useServerFn(ensureDefaultPipelineFn);
  const loadBoard = useServerFn(loadBoardFn);

  const projectQ = useQuery({
    queryKey: ["project", brandId, projectId],
    queryFn: () => get({ data: { brandId: brandId!, projectId } }),
    enabled: !!brandId,
  });
  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => clientsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });
  const teamQ = useQuery({
    queryKey: ["team", brandId],
    queryFn: () => teamFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const clients = (clientsQ.data ?? []) as Array<{ id: string; name: string; color: string | null }>;
  const team = (teamQ.data?.members ?? []) as Array<{ user_id: string; full_name: string | null }>;

  const project = projectQ.data?.project;
  const posts = projectQ.data?.posts ?? [];
  const stats = projectQ.data?.stats ?? { total: 0, approved: 0, published: 0, pending: 0 };

  // Pipeline + stages para o cliente do projeto (para o drawer de nova peça)
  const pipelineQ = useQuery({
    queryKey: ["project-pipeline", brandId, project?.client_id],
    enabled: !!brandId && !!project?.client_id,
    queryFn: async () => {
      let list = await listPipes({ data: { brandId: brandId!, clientId: project!.client_id! } });
      if (list.length === 0) {
        await ensureDefault({ data: { brandId: brandId!, clientId: project!.client_id! } });
        list = await listPipes({ data: { brandId: brandId!, clientId: project!.client_id! } });
      }
      const pipe = list[0];
      if (!pipe) return null;
      const board = await loadBoard({
        data: { brandId: brandId!, clientId: project!.client_id!, pipelineId: pipe.id },
      });
      return { pipelineId: pipe.id, stages: board.stages };
    },
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [clientId, setClientId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [color, setColor] = useState<string>(COLORS[0]);
  const [goals, setGoals] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDesc(project.description ?? "");
    setStatus(project.status);
    setClientId(project.client_id ?? null);
    setOwnerId(project.owner_id ?? null);
    setStartDate(project.start_date ?? null);
    setDueAt(project.due_at ?? null);
    setColor(project.color ?? COLORS[0]);
    setGoals(project.goals ?? "");
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      upd({ data: { brandId: brandId!, projectId, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", brandId, projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const archMut = useMutation({
    mutationFn: () => arch({ data: { brandId: brandId!, projectId } }),
    onSuccess: () => {
      toast.success("Projeto arquivado");
      qc.invalidateQueries({ queryKey: ["projects", brandId] });
      navigate({ to: "/projects" });
    },
  });

  const delMut = useMutation({
    mutationFn: () => del({ data: { brandId: brandId!, projectId } }),
    onSuccess: () => {
      toast.success("Projeto excluído");
      qc.invalidateQueries({ queryKey: ["projects", brandId] });
      navigate({ to: "/projects" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  usePageHeader(
    {
      title: project?.name ?? "Projeto",
      subtitle: "Detalhes, progresso e itens do projeto",
      actions: (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => archMut.mutate()} disabled={archMut.isPending}>
            <Archive className="mr-2 h-4 w-4" /> Arquivar
          </Button>
          <Button variant="destructive" size="sm" className="h-9" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir
          </Button>
        </div>
      ),
    },
    [project?.id, project?.name, archMut.isPending],
  );

  const total = stats.total || 0;
  const pct = total > 0 ? Math.round((stats.published / total) * 100) : 0;

  if (projectQ.isLoading) {
    return (
      <DashboardPageShell>
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </DashboardPageShell>
    );
  }

  if (!project) {
    return (
      <DashboardPageShell>
        <DashboardPanelSurface className="px-4 py-3 text-sm text-muted-foreground">
          Projeto não encontrado.
        </DashboardPanelSurface>
        <Button variant="ghost" size="sm" className="h-9" onClick={() => navigate({ to: "/projects" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </DashboardPageShell>
    );
  }

  function saveField(patch: Record<string, unknown>) {
    patchMut.mutate(patch);
  }

  return (
    <DashboardPageShell>
      <Button variant="ghost" size="sm" className="-ml-2 h-9" onClick={() => navigate({ to: "/projects" })}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
      </Button>

      {/* Header do projeto */}
      <div className="flex items-start gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: color }}
        >
          <ImageIcon className="h-6 w-6 opacity-80" />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== project.name && saveField({ name })}
            className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
          />
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => (desc || null) !== (project.description || null) && saveField({ description: desc || null })}
            placeholder="Adicione uma descrição..."
            className="min-h-[32px] resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
            rows={1}
          />
          {project.plan ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <PlanStatusBadge status={project.plan.status} prefix="Pauta:" />
              <Link
                to="/monthly-plan/$planId"
                params={{ planId: project.plan.id }}
                className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
              >
                Ver pauta{project.plan.title ? ` — ${project.plan.title}` : ""}
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* Formulário compacto */}
      <DashboardPanelSurface className="grid gap-4 p-5 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              saveField({ status: v });
            }}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Cliente</Label>
          <Select
            value={clientId ?? "none"}
            onValueChange={(v) => {
              const next = v === "none" ? null : v;
              setClientId(next);
              saveField({ client_id: next });
            }}
          >
            <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem cliente</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Responsável</Label>
          <Select
            value={ownerId ?? "none"}
            onValueChange={(v) => {
              const next = v === "none" ? null : v;
              setOwnerId(next);
              saveField({ owner_id: next });
            }}
          >
            <SelectTrigger className="h-9"><SelectValue placeholder="Nenhum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {team.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name ?? "Sem nome"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateEdit
          label="Data de início"
          value={startDate}
          onChange={(v) => {
            setStartDate(v);
            saveField({ start_date: v });
          }}
        />
        <DateEdit
          label="Data de término"
          value={dueAt}
          onChange={(v) => {
            setDueAt(v);
            saveField({ due_at: v });
          }}
        />
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Cor</Label>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  saveField({ color: c });
                }}
                aria-label={`Cor ${c}`}
                className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition ${
                  color === c ? "ring-2 ring-foreground" : ""
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-1.5 md:col-span-3">
          <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Objetivos / Metas</Label>
          <Textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            onBlur={() => (goals || null) !== (project.goals || null) && saveField({ goals: goals || null })}
            placeholder="Ex.: Aumentar vendas em 30%, gerar 500 leads..."
            rows={2}
          />
        </div>
      </DashboardPanelSurface>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard icon={<FileText className="h-4 w-4" />} label="Total de peças" value={stats.total} tone="neutral" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Aprovadas" value={stats.approved} tone="emerald" />
        <KpiCard icon={<Target className="h-4 w-4" />} label="Publicadas" value={stats.published} tone="pink" />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Pendentes" value={stats.pending} tone="amber" />
      </div>

      {/* Progresso */}
      <DashboardPanelSurface className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Progresso do projeto
          </h3>
          <span className="text-2xl font-semibold" style={{ color }}>
            {pct}%
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Itens concluídos</span>
          <span>{stats.published} de {stats.total}</span>
        </div>
        <Progress value={pct} className="mt-2 h-2" />
      </DashboardPanelSurface>

      {/* Itens do projeto */}
      <DashboardPanelSurface>
        <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-mono uppercase tracking-widest text-foreground">
              Itens do projeto
            </h3>
            <span className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-xs tabular-nums text-foreground">
              {posts.length}
            </span>
          </div>
          <Button size="sm" className="h-9" onClick={goCreateItem}>
            <Plus className="mr-2 h-4 w-4" /> Novo item
          </Button>
        </div>
        {posts.length === 0 ? (
          <PanelEmptyState
            icon={<FileText className="h-4 w-4" />}
            text="Nenhum item vinculado a este projeto. Clique em Novo item para começar."
          />
        ) : (
          <div className="divide-y divide-border/60 px-4">
            {posts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  {p.cover_url ? (
                    <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.title || "Sem título"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(p.scheduled_at)} · {p.stage ?? "sem etapa"}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {p.published_at ? "Publicado" : (p.review_status ?? p.stage ?? "—")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </DashboardPanelSurface>

      {/* Jobs & Tarefas com Timesheet */}
      <JobsPanel brandId={brandId!} projectId={projectId} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os itens vinculados serão desassociados do projeto,
              mas não serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => delMut.mutate()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {openNewTask && project?.client_id && pipelineQ.data && (
        <TaskDialog
          mode="create"
          open={openNewTask}
          onOpenChange={setOpenNewTask}
          brandId={brandId!}
          clientId={project.client_id}
          pipelineId={pipelineQ.data.pipelineId}
          stages={pipelineQ.data.stages}
          defaultStageId={pipelineQ.data.stages[0]?.id}
          defaultProjectId={projectId}
          invalidateKey={["project", brandId, projectId] as const}
        />
      )}
    </DashboardPageShell>
  );
}

function DateEdit(props: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const date = props.value ? new Date(props.value) : undefined;
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{props.label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 justify-start text-left font-normal">
            {date ? fmtDate(props.value) : <span className="text-muted-foreground">Selecionar</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => props.onChange(d ? d.toISOString() : null)}
            initialFocus
            className="pointer-events-auto p-3"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}