import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const { brandId, setClientId } = useActiveContext();
  const navigate = useNavigate();
  function goCreateItem() {
    if (project?.client_id) setClientId(project.client_id);
    navigate({ to: "/content", search: { project: projectId, new: true } });
  }

  const qc = useQueryClient();

  const get = useServerFn(getProject);
  const upd = useServerFn(updateProject);
  const arch = useServerFn(archiveProject);
  const del = useServerFn(deleteProject);
  const clientsFn = useServerFn(listClients);
  const teamFn = useServerFn(listBrandTeam);

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
          <Button variant="outline" size="sm" onClick={() => archMut.mutate()} disabled={archMut.isPending}>
            <Archive className="mr-2 h-4 w-4" /> Arquivar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
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
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate({ to: "/projects" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  function saveField(patch: Record<string, unknown>) {
    patchMut.mutate(patch);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6 md:px-8">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate({ to: "/projects" })}>
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
        </div>
      </div>

      {/* Formulário compacto */}
      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              saveField({ status: v });
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</Label>
          <Select
            value={clientId ?? "none"}
            onValueChange={(v) => {
              const next = v === "none" ? null : v;
              setClientId(next);
              saveField({ client_id: next });
            }}
          >
            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem cliente</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Responsável</Label>
          <Select
            value={ownerId ?? "none"}
            onValueChange={(v) => {
              const next = v === "none" ? null : v;
              setOwnerId(next);
              saveField({ owner_id: next });
            }}
          >
            <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
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
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cor</Label>
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
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Objetivos / Metas</Label>
          <Textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            onBlur={() => (goals || null) !== (project.goals || null) && saveField({ goals: goals || null })}
            placeholder="Ex.: Aumentar vendas em 30%, gerar 500 leads..."
            rows={2}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard icon={<FileText className="h-4 w-4" />} label="Total de Peças" value={stats.total} tone="text-foreground" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Aprovadas" value={stats.approved} tone="text-emerald-500" />
        <KpiCard icon={<Target className="h-4 w-4" />} label="Publicadas" value={stats.published} tone="text-pink-500" />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Pendentes" value={stats.pending} tone="text-amber-500" />
      </div>

      {/* Progresso */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Progresso do Projeto</h3>
          <span className="text-2xl font-semibold" style={{ color }}>
            {pct}%
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Itens concluídos</span>
          <span>{stats.published} de {stats.total}</span>
        </div>
        <Progress value={pct} className="mt-2 h-2" />
      </div>

      {/* Itens do projeto */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Itens do Projeto ({posts.length})</h3>
          <Button size="sm" onClick={goCreateItem}>
            <Plus className="mr-2 h-4 w-4" /> Novo item
          </Button>
        </div>
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum item vinculado a este projeto.</p>
            <button
              type="button"
              onClick={goCreateItem}
              className="text-sm font-medium text-primary hover:underline"
            >
              Criar novo item
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
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
      </div>

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
    </div>
  );
}

function KpiCard(props: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`mb-1 flex items-center gap-2 ${props.tone}`}>{props.icon}</div>
      <div className="text-2xl font-semibold">{props.value}</div>
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
    </div>
  );
}

function DateEdit(props: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const date = props.value ? new Date(props.value) : undefined;
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{props.label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start text-left font-normal">
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