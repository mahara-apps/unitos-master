import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus, RefreshCw, Server, ShieldCheck } from "lucide-react";

import {
  createInstallationFn,
  getInstallationManagerAccessFn,
  listInstallationsFn,
  type InstallationRecord,
} from "@/lib/installation/manager.functions";
import {
  INSTALLATION_HEALTH_LABEL,
  INSTALLATION_STATUS_LABEL,
  type InstallationStatus,
} from "@/lib/installation/manager-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/instalacoes/")({
  component: AdminInstallationsPage,
});

export const STATUS_TONE: Record<InstallationStatus, string> = {
  preparing: "border-border/60 text-muted-foreground",
  provisioning: "border-severity-info/40 text-severity-info",
  validating: "border-severity-info/40 text-severity-info",
  update_available: "border-severity-warning/40 text-severity-warning",
  up_to_date: "border-health-good/40 text-health-good",
  attention: "border-severity-warning/40 text-severity-warning",
  error: "border-destructive/40 text-destructive",
};

type FormState = {
  name: string;
  domain: string;
  supabaseUrl: string;
  supabaseProjectRef: string;
  gitRepoUrl: string;
  deployProject: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  domain: "",
  supabaseUrl: "",
  supabaseProjectRef: "",
  gitRepoUrl: "",
  deployProject: "",
  notes: "",
};

/** Ciclo de vida de uma instalação — a UI deixa isso explícito. */
const LIFECYCLE = ["Cadastrar", "Provisionar", "Validar", "Configurar", "Pronto"] as const;

function LifecycleTrail({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {LIFECYCLE.map((label, index) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5",
              index < activeIndex && "border-health-good/40 text-health-good",
              index === activeIndex && "border-primary/50 bg-primary/10 text-primary",
              index > activeIndex && "border-border/60 text-muted-foreground",
            )}
          >
            {label}
          </span>
          {index < LIFECYCLE.length - 1 && (
            <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
          )}
        </span>
      ))}
    </div>
  );
}

export function lifecycleIndex(i: {
  status: InstallationStatus;
  lastProvisionedAt: string | null;
  lastValidatedAt: string | null;
}): number {
  if (i.status === "up_to_date") return 4;
  if (i.lastValidatedAt) return 3;
  if (i.lastProvisionedAt) return 2;
  if (i.status === "provisioning" || i.status === "validating") return 1;
  return 0;
}

function AdminInstallationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const accessFn = useServerFn(getInstallationManagerAccessFn);
  const listFn = useServerFn(listInstallationsFn);
  const createFn = useServerFn(createInstallationFn);

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
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: form.name,
          domain: form.domain || null,
          supabaseUrl: form.supabaseUrl || null,
          supabaseProjectRef: form.supabaseProjectRef || null,
          gitRepoUrl: form.gitRepoUrl || null,
          deployProject: form.deployProject || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: (record) => {
      toast.success("Instalação criada. Ela ainda não está pronta.");
      setForm(EMPTY_FORM);
      setCreateOpen(false);
      void qc.invalidateQueries({ queryKey: ["installations"] });
      void navigate({
        to: "/admin/instalacoes/$id",
        params: { id: record.id },
        search: { novo: true },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const installations = list.data?.installations ?? [];
  const kpis = useMemo(() => {
    const count = (fn: (i: InstallationRecord) => boolean) => installations.filter(fn).length;
    return {
      total: installations.length,
      running: count((i) => i.status === "provisioning" || i.status === "validating"),
      outdated: count((i) => i.status === "update_available"),
      problems: count((i) => i.status === "error" || i.status === "attention"),
    };
  }, [installations]);

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Instalações</h2>
          <p className="text-sm text-muted-foreground">
            1 instalação = 1 aplicação = 1 Supabase = 1 workspace = 1 domínio. Somente metadados —
            nenhuma credencial do destino é armazenada. Release do MASTER:{" "}
            <span className="font-mono">{access.data?.releaseVersion}</span>
          </p>
          <LifecycleTrail activeIndex={0} />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova instalação
        </Button>
      </div>

      <PageKpiGrid>
        <PageKpi icon={<Server />} label="Instalações" value={kpis.total} />
        <PageKpi icon={<Loader2 />} label="Em execução" value={kpis.running} status="info" />
        <PageKpi
          icon={<RefreshCw />}
          label="Atualização disponível"
          value={kpis.outdated}
          status="warning"
        />
        <PageKpi
          icon={<ShieldCheck />}
          label="Atenção / erro"
          value={kpis.problems}
          status="danger"
        />
      </PageKpiGrid>

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando instalações…
            </div>
          ) : installations.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma instalação cadastrada ainda.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {installations.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
                    onClick={() =>
                      void navigate({ to: "/admin/instalacoes/$id", params: { id: i.id } })
                    }
                  >
                    <div className="min-w-[220px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{i.name}</span>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", STATUS_TONE[i.status])}
                        >
                          {INSTALLATION_STATUS_LABEL[i.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {i.domain ?? "domínio não informado"} · {INSTALLATION_HEALTH_LABEL[i.health]}
                      </p>
                    </div>

                    <LifecycleTrail activeIndex={lifecycleIndex(i)} />

                    <div className="text-right text-xs text-muted-foreground">
                      <div className="font-mono">{i.currentVersion ?? "—"}</div>
                      <div>disponível {i.availableVersion}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Nova instalação</DialogTitle>
            <DialogDescription>
              Registre apenas metadados: Supabase, repositório e deploy próprios. Nenhum segredo do
              destino pode ser informado aqui.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field
              label="Domínio"
              placeholder="app.cliente.com.br"
              value={form.domain}
              onChange={(v) => setForm({ ...form, domain: v })}
            />
            <Field
              label="URL do Supabase"
              placeholder="https://xxxx.supabase.co"
              value={form.supabaseUrl}
              onChange={(v) => setForm({ ...form, supabaseUrl: v })}
            />
            <Field
              label="Project ref do Supabase"
              value={form.supabaseProjectRef}
              onChange={(v) => setForm({ ...form, supabaseProjectRef: v })}
            />
            <Field
              label="Repositório Git"
              placeholder="https://github.com/org/repo"
              value={form.gitRepoUrl}
              onChange={(v) => setForm({ ...form, gitRepoUrl: v })}
            />
            <Field
              label="Projeto de deploy"
              value={form.deployProject}
              onChange={(v) => setForm({ ...form, deployProject: v })}
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cadastrar
            </Button>
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
