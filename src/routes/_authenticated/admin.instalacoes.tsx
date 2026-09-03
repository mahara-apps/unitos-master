import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  completeInstallationOperationFn,
  createInstallationFn,
  getInstallationFn,
  getInstallationManagerAccessFn,
  listInstallationsFn,
  startInstallationOperationFn,
  type InstallationRecord,
} from "@/lib/installation/manager.functions";
import {
  INSTALLATION_HEALTH_LABEL,
  INSTALLATION_STATUS_LABEL,
  OPERATION_KIND_LABEL,
  OPERATION_STATUS_LABEL,
  canStartOperation,
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

export const Route = createFileRoute("/_authenticated/admin/instalacoes")({
  component: AdminInstallationsPage,
});

const STATUS_TONE: Record<InstallationStatus, string> = {
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

function AdminInstallationsPage() {
  const qc = useQueryClient();
  const accessFn = useServerFn(getInstallationManagerAccessFn);
  const listFn = useServerFn(listInstallationsFn);
  const createFn = useServerFn(createInstallationFn);
  const startFn = useServerFn(startInstallationOperationFn);
  const completeFn = useServerFn(completeInstallationOperationFn);
  const detailFn = useServerFn(getInstallationFn);

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["installation-detail", selectedId],
    queryFn: () => detailFn({ data: { id: selectedId! } }),
    enabled: available && !!selectedId,
    retry: false,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["installations"] });
    void qc.invalidateQueries({ queryKey: ["installation-detail"] });
  };

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
    onSuccess: () => {
      toast.success("Instalação cadastrada.");
      setForm(EMPTY_FORM);
      setCreateOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const start = useMutation({
    mutationFn: (vars: { id: string; kind: "provision" | "validate" | "update" }) =>
      startFn({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(
        vars.kind === "validate"
          ? "Validação preparada — rode verify-installation.sql na instalação."
          : "Execução preparada — rode bootstrap.sh na instalação de destino.",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: (vars: {
      operationId: string;
      ok: boolean;
      warnings?: boolean;
      version?: string | null;
    }) => completeFn({ data: vars }),
    onSuccess: () => {
      toast.success("Resultado registrado.");
      invalidate();
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
        <div>
          <h2 className="text-lg font-semibold">Instalações</h2>
          <p className="text-sm text-muted-foreground">
            Crie, provisione, valide e acompanhe instalações independentes. Somente metadados —
            nenhuma credencial do destino é armazenada. Release do MASTER:{" "}
            <span className="font-mono">{access.data?.releaseVersion}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova instalação
        </Button>
      </div>

      <PageKpiGrid>
        <PageKpi icon={Server} label="Instalações" value={kpis.total} />
        <PageKpi icon={Loader2} label="Em execução" value={kpis.running} status="info" />
        <PageKpi
          icon={RefreshCw}
          label="Atualização disponível"
          value={kpis.outdated}
          status="warning"
        />
        <PageKpi icon={ShieldCheck} label="Atenção / erro" value={kpis.problems} status="danger" />
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
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    className="min-w-[200px] flex-1 text-left"
                    onClick={() => setSelectedId(i.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{i.name}</span>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[i.status])}>
                        {INSTALLATION_STATUS_LABEL[i.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i.domain ?? "domínio não informado"} ·{" "}
                      {INSTALLATION_HEALTH_LABEL[i.health]}
                    </p>
                  </button>

                  <div className="text-right text-xs text-muted-foreground">
                    <div className="font-mono">{i.currentVersion ?? "—"}</div>
                    <div>disponível {i.availableVersion}</div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canStartOperation("provision", i.status) || start.isPending}
                      onClick={() => start.mutate({ id: i.id, kind: "provision" })}
                    >
                      <Rocket className="mr-1.5 h-3.5 w-3.5" /> Provisionar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canStartOperation("validate", i.status) || start.isPending}
                      onClick={() => start.mutate({ id: i.id, kind: "validate" })}
                    >
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Validar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canStartOperation("update", i.status) || start.isPending}
                      onClick={() => start.mutate({ id: i.id, kind: "update" })}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Nova instalação */}
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
            <div className="sm:col-span-2 space-y-1.5">
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

      {/* Detalhes + histórico */}
      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{detail.data?.installation.name ?? "Instalação"}</DialogTitle>
            <DialogDescription>
              Histórico de operações e estado atual. A execução acontece pelos scripts em{" "}
              <span className="font-mono">supabase/install/</span>.
            </DialogDescription>
          </DialogHeader>

          {detail.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : detail.data ? (
            <div className="space-y-4">
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <Info label="Situação" value={INSTALLATION_STATUS_LABEL[detail.data.installation.status]} />
                <Info label="Saúde" value={INSTALLATION_HEALTH_LABEL[detail.data.installation.health]} />
                <Info label="Versão atual" value={detail.data.installation.currentVersion ?? "—"} />
                <Info label="Versão disponível" value={detail.data.installation.availableVersion} />
                <Info label="Supabase" value={detail.data.installation.supabaseUrl ?? "—"} />
                <Info label="Repositório" value={detail.data.installation.gitRepoUrl ?? "—"} />
                <Info label="Deploy" value={detail.data.installation.deployProject ?? "—"} />
                <Info label="Domínio" value={detail.data.installation.domain ?? "—"} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Histórico de operações
                </p>
                <ul className="space-y-2">
                  {detail.data.operations.map((op) => (
                    <li key={op.id} className="rounded-lg border border-border/60 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{OPERATION_KIND_LABEL[op.kind]}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {OPERATION_STATUS_LABEL[op.status]}
                        </Badge>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {new Date(op.startedAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      {op.summary && (
                        <p className="mt-1 text-xs text-muted-foreground">{op.summary}</p>
                      )}
                      {op.status === "pending" && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={complete.isPending}
                            onClick={() =>
                              complete.mutate({
                                operationId: op.id,
                                ok: true,
                                version: detail.data?.installation.availableVersion ?? null,
                              })
                            }
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Registrar sucesso
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={complete.isPending}
                            onClick={() =>
                              complete.mutate({ operationId: op.id, ok: false })
                            }
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Registrar falha
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                  {detail.data.operations.length === 0 && (
                    <li className="text-xs text-muted-foreground">Nenhuma operação registrada.</li>
                  )}
                </ul>
              </div>
            </div>
          ) : null}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-xs">{value}</p>
    </div>
  );
}
