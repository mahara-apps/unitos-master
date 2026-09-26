import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Github,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  XCircle,
  ListChecks,
} from "lucide-react";

import {
  createInstallationFn,
  getInstallationManagerAccessFn,
  getMasterVersionFn,
  listInstallationsFn,
  runAutomatedUpdateFn,
  propagateMasterGithubTokenFn,
  PROPAGATE_GITHUB_TOKEN_CONFIRM_LABEL,
  type GithubTokenPropagationItem,
  type InstallationRecord,
} from "@/lib/installation/manager.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
import { InstallationCard } from "@/components/installations/installation-card";
import { CriticalConfirmDialog } from "@/components/ui/critical-confirm-dialog";
import { MasterPublishedState } from "@/components/installations/master-published-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/instalacoes/")({
  component: AdminInstallationsPage,
  head: () => ({
    meta: [
      { title: "Instalações · Administração Unitos" },
      {
        name: "description",
        content: "Inventário, versões e estado operacional das instalações do Unitos.",
      },
      { property: "og:title", content: "Instalações · Administração Unitos" },
      {
        property: "og:description",
        content: "Acompanhe instalações, versões e operações do Unitos Master.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type FormState = {
  name: string;
  domain: string;
  supabaseUrl: string;
  supabaseProjectRef: string;
  gitRepoUrl: string;
  deployProject: string;
  notes: string;
  supabaseManagementToken: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  domain: "",
  supabaseUrl: "",
  supabaseProjectRef: "",
  gitRepoUrl: "",
  deployProject: "",
  notes: "",
  supabaseManagementToken: "",
};

const DEFAULT_GITHUB_OWNER = "mahara-apps";

function supabaseProjectRefFromUrl(value: string): string {
  const match = value.trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function technicalNameFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

type Filter = "all" | "running" | "outdated" | "problems";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "running", label: "Em execução" },
  { id: "outdated", label: "Atualização" },
  { id: "problems", label: "Atenção" },
];

const matchesFilter = (i: InstallationRecord, filter: Filter) => {
  if (filter === "running")
    return i.status === "provisioning" || i.status === "updating" || i.status === "validating";
  if (filter === "outdated") return i.status === "update_available";
  if (filter === "problems") return i.status === "error" || i.status === "attention";
  return true;
};

function AdminInstallationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const accessFn = useServerFn(getInstallationManagerAccessFn);
  const listFn = useServerFn(listInstallationsFn);
  const createFn = useServerFn(createInstallationFn);
  const masterVersionFn = useServerFn(getMasterVersionFn);
  const updateFn = useServerFn(runAutomatedUpdateFn);

  const access = useQuery({
    queryKey: ["installation-manager-access"],
    queryFn: () => accessFn(undefined),
    retry: false,
  });
  const available = access.data?.available === true;

  const list = useQuery({
    queryKey: ["installations"],
    queryFn: () => listFn(undefined),
    enabled: available,
    retry: false,
    refetchInterval: 5000,
  });

  // Versão que existe no pacote publicado do MASTER: quando fica atrás do
  // sistema, autorizar atualização não envia código novo.
  const masterVersion = useQuery({
    queryKey: ["installations-master-version"],
    queryFn: () => masterVersionFn({ data: undefined }),
    enabled: available,
    retry: false,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [approvedCommit, setApprovedCommit] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [propagateOpen, setPropagateOpen] = useState(false);
  const [propagateConfirm, setPropagateConfirm] = useState("");
  const [propagateResults, setPropagateResults] = useState<GithubTokenPropagationItem[] | null>(
    null,
  );
  const goToCredentialsRef = useRef(false);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreateStep(1);
    setCreateOpen(true);
  };

  const propagateFn = useServerFn(propagateMasterGithubTokenFn);
  const propagate = useMutation({
    mutationFn: () => propagateFn({ data: { confirmLabel: propagateConfirm } }),
    onSuccess: (out) => {
      setPropagateResults(out.results);
      if (out.failed === 0) {
        toast.success(`Token do GitHub aplicado em ${out.updated} instalação(ões).`);
      } else {
        toast.warning(`Token aplicado em ${out.updated}; ${out.failed} falharam.`);
      }
      void qc.invalidateQueries({ queryKey: ["installations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!form.supabaseManagementToken.trim()) {
        throw new Error("Informe o Supabase Access Token do cliente para cadastrar a instalação.");
      }
      return createFn({
        data: {
          name: form.name,
          domain: form.domain || null,
          supabaseUrl: form.supabaseUrl || null,
          supabaseProjectRef: form.supabaseProjectRef || null,
          gitRepoUrl: form.gitRepoUrl || null,
          deployProject: form.deployProject || null,
          notes: form.notes || null,
          supabaseManagementToken: form.supabaseManagementToken.trim(),
        },
      });
    },
    onSuccess: (record) => {
      toast.success("Instalação criada. Ela ainda não está pronta.");
      setForm(EMPTY_FORM);
      setCreateOpen(false);
      void qc.invalidateQueries({ queryKey: ["installations"] });
      const goCreds = goToCredentialsRef.current;
      goToCredentialsRef.current = false;
      void navigate({
        to: "/admin/instalacoes/$id",
        params: { id: record.id },
        search: goCreds ? { novo: true, tab: "acessos" } : { novo: true },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const installations = list.data?.installations ?? [];
  const newProjectRef = supabaseProjectRefFromUrl(form.supabaseUrl);
  const newEnvironmentName = form.deployProject.trim().toLowerCase();
  const newRepoUrl = newEnvironmentName
    ? `https://github.com/${DEFAULT_GITHUB_OWNER}/${newEnvironmentName}`
    : "";
  const kpis = useMemo(() => {
    const count = (fn: (i: InstallationRecord) => boolean) => installations.filter(fn).length;
    return {
      total: installations.length,
      running: count(
        (i) => i.status === "provisioning" || i.status === "updating" || i.status === "validating",
      ),
      outdated: count((i) => i.status === "update_available"),
      problems: count((i) => i.status === "error" || i.status === "attention"),
    };
  }, [installations]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return installations.filter(
      (i) =>
        matchesFilter(i, filter) &&
        (!term ||
          i.name.toLowerCase().includes(term) ||
          (i.domain ?? "").toLowerCase().includes(term)),
    );
  }, [installations, search, filter]);
  const eligible = (i: InstallationRecord) =>
    i.updateAvailable && !!i.deployProject && !i.activeOperationId &&
    ["up_to_date", "update_available", "attention", "error"].includes(i.status);
  const selected = visible.filter((i) => selectedIds.includes(i.id) && eligible(i));
  const batches = Object.entries(
    (list.data?.batchOperations ?? []).reduce<Record<string, NonNullable<typeof list.data>["batchOperations"]>>((groups, op) => {
      const detail = op.detail as { batchId?: string } | null;
      if (detail?.batchId) (groups[detail.batchId] ??= []).push(op);
      return groups;
    }, {}),
  ).slice(0, 5);
  const closeApproval = () => {
    setReviewOpen(false);
    setConfirmOpen(false);
    setApprovedIds([]);
    setApprovedCommit(null);
    setBatchId(null);
    setSelectedIds([]);
  };
  const batchUpdate = useMutation({
    mutationFn: () => {
      if (!batchId || !approvedCommit || approvedIds.length < 2) throw new Error("Revise a seleção.");
      return updateFn({ data: {
        id: approvedIds[0], batchIds: approvedIds, batchId,
        commitSha: approvedCommit, confirmLabel: `ATUALIZAR ${approvedIds.length} INSTALAÇÕES`,
      } });
    },
    onSuccess: (result) => {
      closeApproval();
      void qc.invalidateQueries({ queryKey: ["installations"] });
      if (result.result === "BATCH") toast.info(result.reasons.length ? result.reasons.join(" ") : `${result.items.length} instalações colocadas em fila.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (access.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verificando disponibilidade do módulo…
      </div>
    );
  }

  if (!available) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          O módulo de Instalações existe apenas na instalação MASTER do Unitos e é exclusivo do
          Super Admin.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">Instalações</h2>
            <Badge variant="outline" className="text-[10px]">
              {installations.length} cadastrada{installations.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
              MASTER {access.data?.releaseVersion}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada instalação é uma aplicação independente — só metadados ficam aqui, nunca
            credenciais do destino.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" disabled={selected.length < 2 || selected.length > 20 || masterVersion.data?.masterPublished !== true || !masterVersion.data.commitSha} onClick={() => setReviewOpen(true)}>
            <ListChecks className="mr-2 h-4 w-4" /> Atualizar selecionadas ({selected.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPropagateOpen(true);
              setPropagateConfirm("");
              setPropagateResults(null);
            }}
          >
            <Github className="mr-2 h-4 w-4" /> Aplicar token do GitHub
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nova instalação
          </Button>
        </div>
      </header>

      <MasterPublishedState snapshot={masterVersion.data} pending={masterVersion.isPending} />

      <PageKpiGrid>
        <PageKpi icon={<Server />} label="Total" value={kpis.total} />
        <PageKpi icon={<Loader2 />} label="Em execução" value={kpis.running} status="info" />
        <PageKpi
          icon={<RefreshCw />}
          label="Atualização disponível"
          value={kpis.outdated}
          status="warning"
        />
        <PageKpi icon={<AlertTriangle />} label="Atenção" value={kpis.problems} status="danger" />
      </PageKpiGrid>

      {batches.map(([id, operations]) => {
        const ordered = [...operations].sort((a, b) => Number((a.detail as { batchPosition?: number })?.batchPosition ?? 0) - Number((b.detail as { batchPosition?: number })?.batchPosition ?? 0));
        const total = Number((ordered[0]?.detail as { batchTotal?: number })?.batchTotal ?? ordered.length);
        const stopped = ordered.some((op) => ["failed", "blocked", "manual_review"].includes(op.status));
        return <section key={id} className="space-y-2 border-b border-border pb-4" aria-label={`Remessa de ${total} instalações`}>
          <h3 className="text-sm font-semibold">Atualização em fila · {ordered.filter((op) => op.status === "success").length} de {total} concluídas {stopped ? "· interrompida" : ""}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {ordered.map((op) => {
              const installation = installations.find((i) => i.id === op.installation_id);
              const position = Number((op.detail as { batchPosition?: number })?.batchPosition ?? 0);
              const label = op.status === "success" ? "Concluída" : ["failed", "blocked", "manual_review"].includes(op.status) ? "Falhou / bloqueada" : stopped && op.status === "pending" ? "Aguardando decisão" : op.status === "running" ? "Executando" : "Aguardando";
              return <div key={op.id} className="flex items-center justify-between gap-2 border border-border p-3 text-sm">
                <span className="min-w-0 truncate">{position}. {installation?.name ?? "Instalação"} · {label}</span>
                <Button asChild size="sm" variant="ghost"><Link to="/admin/instalacoes/$id" params={{ id: op.installation_id }}>Detalhes <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>
              </div>;
            })}
          </div>
          {ordered.length < total && <p className="text-xs text-destructive">{total - ordered.length} instalação(ões) não preparada(s). Revise antes de qualquer nova tentativa.</p>}
        </section>;
      })}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou domínio"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "secondary" : "ghost"}
              className={cn("h-9 text-xs", filter === f.id && "font-semibold")}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((n) => (
            <Card key={n}>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : list.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Não foi possível carregar as instalações</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A leitura falhou. Nenhum dado foi alterado; tente novamente para consultar o estado
              atual.
            </p>
            <Button size="sm" variant="outline" onClick={() => void list.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : installations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Server className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">Nenhuma instalação cadastrada</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Cadastre a primeira instalação para provisionar, validar e acompanhar a versão
              publicada.
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nova instalação
            </Button>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma instalação corresponde à busca ou ao filtro selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((i) => (
            <InstallationCard
              key={i.id}
              installation={i}
              selection={{ checked: selectedIds.includes(i.id), disabled: !eligible(i) || (selected.length >= 20 && !selectedIds.includes(i.id)), onChange: (checked) => setSelectedIds((previous) => checked ? [...previous, i.id] : previous.filter((id) => id !== i.id)) }}
            />
          ))}
        </div>
      )}

      <Dialog open={reviewOpen} onOpenChange={(open) => { if (!open) closeApproval(); else setReviewOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Revisar atualizações</DialogTitle><DialogDescription>Até 20 instalações, uma por vez. A próxima só começa quando a anterior terminar com sucesso.</DialogDescription></DialogHeader>
          <ul className="max-h-72 space-y-2 overflow-auto text-sm">
            {selected.map((i, index) => <li key={i.id} className="flex items-center justify-between gap-2 border-b py-2">
              <span>{index + 1}. {i.name}<span className="block text-xs text-muted-foreground">{i.pinnedRelease ?? i.currentVersion ?? "Sem versão"} → {masterVersion.data?.repoRelease} · {masterVersion.data?.commitSha?.slice(0, 7)}</span></span>
              <Button size="icon" variant="ghost" aria-label={`Remover ${i.name}`} onClick={() => setSelectedIds((previous) => previous.filter((id) => id !== i.id))}><XCircle className="h-4 w-4" /></Button>
            </li>)}
          </ul>
          <DialogFooter><Button variant="ghost" onClick={closeApproval}>Cancelar</Button><Button disabled={selected.length < 2 || selected.length > 20 || masterVersion.data?.masterPublished !== true || !masterVersion.data.commitSha} onClick={() => {
            setApprovedIds(selected.map((i) => i.id));
            setApprovedCommit(masterVersion.data?.commitSha ?? null);
            setBatchId(crypto.randomUUID());
            setReviewOpen(false); setConfirmOpen(true);
          }}>Revisar e continuar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <CriticalConfirmDialog open={confirmOpen} onOpenChange={(open) => { if (!open) closeApproval(); }} title="Confirmar atualização múltipla" impact="As instalações serão atualizadas em sequência; uma falha interrompe a fila." confirmText={`ATUALIZAR ${approvedIds.length} INSTALAÇÕES`} details={[{ label: "Instalações", value: approvedIds.map((id) => installations.find((i) => i.id === id)?.name ?? id).join(", ") }, { label: "Versão", value: masterVersion.data?.repoRelease ?? "—" }, { label: "Commit", value: approvedCommit?.slice(0, 7) ?? "—" }]} pending={batchUpdate.isPending} actionLabel="Iniciar fila" onConfirm={() => {
        if (approvedIds.some((id) => !selected.some((i) => i.id === id)) || selected.length !== approvedIds.length || masterVersion.data?.commitSha !== approvedCommit || masterVersion.data?.masterPublished !== true) {
          closeApproval(); toast.error("A lista ou a versão mudou. Revise novamente."); return;
        }
        batchUpdate.mutate();
      }} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Nova instalação</DialogTitle>
            <DialogDescription>
              Crie um ambiente independente, começando do zero na versão atual do MASTER.
            </DialogDescription>
          </DialogHeader>

          <ol className="grid grid-cols-3 gap-2" aria-label="Etapas da nova instalação">
            {(
              [
                [1, "Novo ambiente"],
                [2, "Publicação"],
                [3, "Revisão"],
              ] as const
            ).map(([step, label]) => (
              <li
                key={step}
                className={cn(
                  "border-b-2 pb-2 text-xs font-medium",
                  createStep === step
                    ? "border-primary text-foreground"
                    : createStep > step
                      ? "border-health-good text-health-good"
                      : "border-border text-muted-foreground",
                )}
              >
                <span className="mr-1.5">{createStep > step ? "✓" : step}.</span>
                {label}
              </li>
            ))}
          </ol>

          {createStep === 1 && (
            <div className="space-y-4 py-1">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Use um projeto Supabase novo e vazio.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Esta instalação não consultará nem reaproveitará ambientes, usuários ou dados
                  antigos.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Nome da instalação"
                  placeholder="Unitos Cliente"
                  value={form.name}
                  onChange={(name) => {
                    const previousGenerated = technicalNameFromName(form.name);
                    setForm({
                      ...form,
                      name,
                      deployProject:
                        !form.deployProject || form.deployProject === previousGenerated
                          ? technicalNameFromName(name)
                          : form.deployProject,
                    });
                  }}
                />
                <Field
                  label="Domínio"
                  placeholder="app.cliente.com.br"
                  value={form.domain}
                  onChange={(domain) => setForm({ ...form, domain })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-supabase-url">Endereço do novo Supabase</Label>
                <Input
                  id="new-supabase-url"
                  placeholder="https://novo-projeto.supabase.co"
                  value={form.supabaseUrl}
                  onChange={(e) => setForm({ ...form, supabaseUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {newProjectRef
                    ? `Projeto identificado: ${newProjectRef}`
                    : "Cole o endereço exibido nas configurações do novo projeto."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-supabase-token">Token de acesso do Supabase</Label>
                <PasswordInput
                  id="new-supabase-token"
                  value={form.supabaseManagementToken}
                  placeholder="sbp_..."
                  autoComplete="off"
                  onChange={(e) => setForm({ ...form, supabaseManagementToken: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Usado para preparar e verificar o novo projeto. O valor fica protegido.
                </p>
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="new-environment-name">Nome técnico da nova instalação</Label>
                <Input
                  id="new-environment-name"
                  placeholder="unitos-cliente"
                  value={form.deployProject}
                  onChange={(e) =>
                    setForm({ ...form, deployProject: technicalNameFromName(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  O MASTER usará este nome para criar a publicação e o repositório.
                </p>
              </div>
              <div className="divide-y rounded-md border border-border bg-muted/20 text-sm">
                <div className="flex items-start justify-between gap-4 p-3">
                  <span className="text-muted-foreground">Publicação</span>
                  <span className="break-all text-right font-medium">{newEnvironmentName}</span>
                </div>
                <div className="flex items-start justify-between gap-4 p-3">
                  <span className="text-muted-foreground">Repositório</span>
                  <span className="break-all text-right font-medium">{newRepoUrl}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-notes">Observações</Label>
                <Textarea
                  id="new-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-4 py-1">
              <div className="rounded-md border border-health-good/40 bg-health-good/5 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-health-good">
                  <CheckCircle2 className="h-4 w-4" /> Instalação totalmente nova
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Banco, usuários, arquivos, publicação e repositório começarão sem dados de
                  instalações anteriores.
                </p>
              </div>
              <div className="grid gap-1 rounded-md border border-border p-3 text-xs sm:grid-cols-[130px_1fr]">
                <span className="text-muted-foreground">Nome</span>
                <span>{form.name}</span>
                <span className="text-muted-foreground">Domínio</span>
                <span className="break-all">{form.domain}</span>
                <span className="text-muted-foreground">Novo Supabase</span>
                <span className="break-all">{newProjectRef}</span>
                <span className="text-muted-foreground">Nova publicação</span>
                <span className="break-all">{newEnvironmentName}</span>
                <span className="text-muted-foreground">Novo repositório</span>
                <span className="break-all">{newRepoUrl}</span>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border pt-4">
            {createStep === 1 ? (
              <Button
                variant="ghost"
                disabled={create.isPending}
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </Button>
            ) : (
              <Button
                variant="ghost"
                disabled={create.isPending}
                onClick={() => setCreateStep((step) => (step === 3 ? 2 : 1))}
              >
                Voltar
              </Button>
            )}
            {createStep < 3 ? (
              <Button
                disabled={
                  createStep === 1
                    ? !form.name.trim() ||
                      !form.domain.trim() ||
                      !newProjectRef ||
                      !form.supabaseManagementToken.trim()
                    : !newEnvironmentName
                }
                onClick={() => {
                  setForm((current) => ({
                    ...current,
                    supabaseProjectRef: newProjectRef,
                    gitRepoUrl: newRepoUrl,
                    deployProject: newEnvironmentName,
                  }));
                  setCreateStep((step) => (step === 1 ? 2 : 3));
                }}
              >
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  goToCredentialsRef.current = false;
                  create.mutate();
                }}
                disabled={create.isPending}
              >
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar nova instalação
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propagação do token do GitHub do MASTER para todas as instalações */}
      <Dialog open={propagateOpen} onOpenChange={setPropagateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aplicar token do GitHub nas instalações</DialogTitle>
            <DialogDescription>
              Copia o token do GitHub do MASTER (segredo do servidor) para o cofre cifrado de{" "}
              <strong>todas as instalações</strong> cadastradas. Use quando o token da organização é
              regenerado e as operações de código começam a falhar com acesso negado. O valor do
              token nunca é exibido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <strong>Atenção.</strong> A substituição é imediata em todas as instalações. O token
              precisa de <strong>Contents: Read and write</strong> nos repositórios de todas elas —
              senão a próxima publicação de código falha com 403.
            </div>

            {propagateResults ? (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                {propagateResults.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    {r.ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <span className="min-w-0">
                      <span className="font-medium">{r.name}</span>
                      {!r.ok && r.error ? (
                        <span className="block text-destructive">{r.error}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Para confirmar, digite{" "}
                  <span className="font-mono font-semibold">
                    {PROPAGATE_GITHUB_TOKEN_CONFIRM_LABEL}
                  </span>
                </Label>
                <Input
                  value={propagateConfirm}
                  onChange={(e) => setPropagateConfirm(e.target.value)}
                  autoComplete="off"
                  placeholder={PROPAGATE_GITHUB_TOKEN_CONFIRM_LABEL}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPropagateOpen(false)}>
              {propagateResults ? "Fechar" : "Cancelar"}
            </Button>
            {!propagateResults && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => propagate.mutate()}
                disabled={
                  propagate.isPending ||
                  propagateConfirm.trim().toLowerCase() !==
                    PROPAGATE_GITHUB_TOKEN_CONFIRM_LABEL.toLowerCase()
                }
              >
                {propagate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aplicar em todas
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{props.label}</Label>
      <Input
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
