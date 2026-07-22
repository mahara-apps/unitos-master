import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  FileBarChart2,
  Filter,
  Layers,
  Plus,
  Search,
  Send,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BrainWidget } from "@/components/brain/brain-widget";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { usePageHeader } from "@/hooks/use-page-header";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients } from "@/lib/workspace.functions";
import { listBrandTeam } from "@/lib/team.functions";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  DashboardPageShell,
  DashboardPanelSurface,
} from "@/components/ui/dashboard-primitives";
import {
  createProject,
  listProjects,
  type ProjectStats,
} from "@/lib/projects.functions";
import { NewFromTemplateDialog } from "@/components/projects/new-from-template-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsIndexPage,
});

const COLORS = [
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f59e0b", // amber
  "#10b981", // emerald
  "#0ea5e9", // sky
  "#71717a", // neutral
];

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  planning: { label: "Planejamento", className: "border-border/60 bg-muted text-muted-foreground" },
  active: { label: "Ativa", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  in_progress: { label: "Em execução", className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  paused: { label: "Pausada", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  done: { label: "Concluída", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  archived: { label: "Arquivada", className: "border-border/60 bg-muted text-muted-foreground" },
};

const ProjectSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  client_id: z.string().uuid().nullable(),
  owner_id: z.string().uuid().nullable(),
  status: z.enum(["planning", "active", "in_progress", "paused", "done"]),
  color: z.string(),
  start_date: z.string().nullable(),
  due_at: z.string().nullable(),
  goals: z.string().max(4000).optional(),
});
type ProjectFormValues = z.infer<typeof ProjectSchema>;

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function ProjectsIndexPage() {
  const { brandId, clientId: activeClientId } = useActiveContext();
  const qc = useQueryClient();
  const brainEnabled = useFeatureAccess("brain").enabled;
  const list = useServerFn(listProjects);
  const create = useServerFn(createProject);
  const clientsFn = useServerFn(listClients);
  const teamFn = useServerFn(listBrandTeam);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>(activeClientId ?? "all");
  // Trava o filtro no cliente ativo da sidebar (modo agência = "all").
  useEffect(() => {
    setClientFilter(activeClientId ?? "all");
  }, [activeClientId]);
  const [formOpen, setFormOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  const projectsQ = useQuery({
    queryKey: ["projects", brandId, statusFilter, ownerFilter, clientFilter],
    queryFn: () =>
      list({
        data: {
          brandId: brandId!,
          status: statusFilter === "all" ? null : (statusFilter as never),
          ownerId: ownerFilter === "all" ? null : ownerFilter,
          clientId: clientFilter === "all" ? null : clientFilter,
        },
      }),
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
  const team = (teamQ.data?.members ?? []) as Array<{ user_id: string; full_name: string | null }>;
  const clients = (clientsQ.data ?? []) as Array<{ id: string; name: string; color: string | null }>;

  const filtered = useMemo(() => {
    const rows = projectsQ.data?.projects ?? [];
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(query));
  }, [projectsQ.data, q]);

  const kpis = useMemo(() => {
    const rows = projectsQ.data?.projects ?? [];
    const stats = projectsQ.data?.stats ?? {};
    let total = 0;
    let published = 0;
    let approved = 0;
    for (const p of rows) {
      const s = stats[p.id];
      if (!s) continue;
      total += s.total || 0;
      published += s.published || 0;
      approved += s.approved || 0;
    }
    const active = rows.filter((r) => r.status === "active" || r.status === "in_progress").length;
    return { count: rows.length, active, total, published, approved };
  }, [projectsQ.data]);

  const createMut = useMutation({
    mutationFn: (values: ProjectFormValues) =>
      create({ data: { brandId: brandId!, values } }),
    onSuccess: () => {
      toast.success("Projeto criado");
      qc.invalidateQueries({ queryKey: ["projects", brandId] });
      setFormOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  usePageHeader(
    {
      title: "Projetos",
      subtitle: "Gerencie seus projetos e acompanhe o progresso das publicações.",
      actions: (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9">
            <FileBarChart2 className="mr-2 h-4 w-4" />
            Relatório
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="mr-2 h-4 w-4" /> Novo projeto
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setFormOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Em branco
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" /> A partir de modelo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
    [brandId],
  );

  if (!brandId) {
    return (
      <DashboardPageShell>
        <DashboardPanelSurface className="flex items-start gap-3 px-4 py-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
          Selecione um workspace no menu lateral para ver os projetos.
        </DashboardPanelSurface>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          tone="neutral"
          icon={<Layers className="h-4 w-4" />}
          label="Projetos"
          value={kpis.count}
          sub={`${kpis.active} em andamento`}
        />
        <KpiCard
          tone="sky"
          icon={<TrendingUp className="h-4 w-4" />}
          label="Publicações"
          value={kpis.total}
          sub="Total no escopo"
        />
        <KpiCard
          tone="emerald"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Aprovadas"
          value={kpis.approved}
          sub={`${kpis.total > 0 ? Math.round((kpis.approved / kpis.total) * 100) : 0}% do total`}
        />
        <KpiCard
          tone="pink"
          icon={<Send className="h-4 w-4" />}
          label="Publicadas"
          value={kpis.published}
          sub={`${kpis.total > 0 ? Math.round((kpis.published / kpis.total) * 100) : 0}% do total`}
        />
      </div>

      {/* Filtros */}
      <DashboardPanelSurface className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="h-9 w-[180px] text-xs">
            <UserIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Todos..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os responsáveis</SelectItem>
            {team.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.full_name ?? "Sem nome"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={clientFilter}
          onValueChange={setClientFilter}
          disabled={!!activeClientId}
        >
          <SelectTrigger className="h-9 w-[180px] text-xs">
            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DashboardPanelSurface>

      {brainEnabled && <BrainWidget preset="projects" />}

      {/* Grid de projetos */}
      {projectsQ.isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border/60 bg-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <DashboardPanelSurface>
          <PanelEmptyState
            icon={<FileBarChart2 className="h-4 w-4" />}
            text="Nenhum projeto encontrado. Crie o primeiro clicando em Novo Projeto."
          />
        </DashboardPanelSurface>
      ) : (
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const stats: ProjectStats =
              projectsQ.data?.stats?.[p.id] ?? { total: 0, approved: 0, published: 0, pending: 0 };
            const client = clients.find((c) => c.id === p.client_id);
            const meta = STATUS_META[p.status] ?? STATUS_META.active;
            const total = stats.total || 0;
            const pct = total > 0 ? Math.round((stats.published / total) * 100) : 0;
            return (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card p-5 transition-all hover:border-border hover:shadow-sm"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ background: p.color ?? "#8b5cf6" }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: p.color ?? "#8b5cf6" }}
                    />
                    <div className="truncate text-sm font-semibold text-foreground">{p.name}</div>
                  </div>
                  <Badge variant="outline" className={`h-5 shrink-0 rounded-full px-2 text-[10px] ${meta.className}`}>
                    {meta.label}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarIcon className="h-3 w-3" />
                  <span>
                    {fmtDate(p.start_date)} — {fmtDate(p.due_at)}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono uppercase tracking-widest text-muted-foreground">
                      Progresso
                    </span>
                    <span className="font-medium text-foreground">
                      {stats.published}/{total} publicadas
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>

                {client ? (
                  <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: client.color ?? "#8b5cf6" }}
                    />
                    <span className="truncate">{client.name}</span>
                  </div>
                ) : (
                  <div className="mt-4 text-[11px] text-muted-foreground">Sem cliente vinculado</div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        clients={clients}
        team={team}
        submitting={createMut.isPending}
        onSubmit={(v) => createMut.mutate(v)}
      />
      <NewFromTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        brandId={brandId!}
      />
    </DashboardPageShell>
  );
}

function ProjectFormDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: Array<{ id: string; name: string; color: string | null }>;
  team: Array<{ user_id: string; full_name: string | null }>;
  submitting: boolean;
  onSubmit: (v: ProjectFormValues) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>({
    name: "",
    client_id: null,
    owner_id: null,
    status: "active",
    color: COLORS[0],
    start_date: null,
    due_at: null,
    goals: "",
  });

  function submit() {
    const parsed = ProjectSchema.safeParse(values);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    props.onSubmit(parsed.data);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo Projeto</DialogTitle>
          <DialogDescription>
            Agrupe as publicações de uma campanha em um projeto.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="p-name">Nome do projeto</Label>
            <Input
              id="p-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="Ex.: Lançamento Verão"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={values.status}
                onValueChange={(v) => setValues((s) => ({ ...s, status: v as ProjectFormValues["status"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_META)
                    .filter(([k]) => k !== "archived")
                    .map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Cliente</Label>
              <Select
                value={values.client_id ?? "none"}
                onValueChange={(v) => setValues((s) => ({ ...s, client_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {props.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável</Label>
              <Select
                value={values.owner_id ?? "none"}
                onValueChange={(v) => setValues((s) => ({ ...s, owner_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {props.team.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name ?? "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="Data de início"
              value={values.start_date}
              onChange={(v) => setValues((s) => ({ ...s, start_date: v }))}
            />
            <DateField
              label="Data de término"
              value={values.due_at}
              onChange={(v) => setValues((s) => ({ ...s, due_at: v }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValues((s) => ({ ...s, color: c }))}
                  aria-label={`Cor ${c}`}
                  className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition ${
                    values.color === c ? "ring-2 ring-foreground" : ""
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-goals">Objetivos / Metas</Label>
            <Textarea
              id="p-goals"
              value={values.goals ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, goals: e.target.value }))}
              placeholder="Ex.: Aumentar vendas em 30%, gerar 500 leads..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={props.submitting}>
            {props.submitting ? "Salvando..." : "Criar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DateField(props: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const date = props.value ? new Date(props.value) : undefined;
  return (
    <div className="grid gap-1.5">
      <Label>{props.label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? fmtDate(props.value) : <span className="text-muted-foreground">Selecionar data</span>}
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