import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import {
  cancelInstallationOperationFn,
  completeInstallationOperationFn,
  getInstallationFn,
  getAutomationCapabilityFn,
  refreshInstallationHealthFn,
  resumeAutomatedProvisionFn,
  restartAutomatedProvisionFn,
  runAutomatedProvisionFn,
  startInstallationOperationFn,
} from "@/lib/installation/manager.functions";
import {
  CHECK_STATE_LABEL,
  HEALTH_CHECKS,
  INSTALLATION_HEALTH_LABEL,
  INSTALLATION_STATUS_LABEL,
  OPERATION_KIND_LABEL,
  OPERATION_STATUS_LABEL,
  STEP_STATE_LABEL,
  canStartOperation,
  isOperationStale,
  updateSummary,
  type CheckState,
  type InstallationOperationKind,
  type OperationStep,
  type StepState,
} from "@/lib/installation/manager-contract";
import {
  CORE_REQUIREMENTS,
  CORE_STATE_LABEL,
  OPTIONAL_CONFIG,
  OPTIONAL_STATE_LABEL,
  OVERALL_STATE_ICON,
  OVERALL_STATE_LABEL,
  computeReadiness,
  customDomainState,
  type CoreState,
  type OptionalState,
} from "@/lib/installation/readiness-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { STATUS_TONE } from "./admin.instalacoes.index";

export const Route = createFileRoute("/_authenticated/admin/instalacoes/$id")({
  validateSearch: (search: Record<string, unknown>): { novo?: true } =>
    search["novo"] === true || search["novo"] === "true" ? { novo: true } : {},
  component: InstallationDetailPage,
  head: () => ({
    meta: [
      { title: "Instalação · Administração Unitos" },
      {
        name: "description",
        content:
          "Provisionamento, validação, saúde e histórico de uma instalação independente do Unitos.",
      },
      { property: "og:title", content: "Instalação · Administração Unitos" },
      {
        property: "og:description",
        content: "Acompanhe provisionamento, validação e saúde da instalação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CHECK_TONE: Record<CheckState, string> = {
  ok: "border-health-good/40 text-health-good",
  attention: "border-severity-warning/40 text-severity-warning",
  error: "border-destructive/40 text-destructive",
  pending: "border-border/60 text-muted-foreground",
};

const STEP_TONE: Record<StepState, string> = {
  pending: "text-muted-foreground",
  running: "text-severity-info",
  done: "text-health-good",
  error: "text-destructive",
};

const CORE_TONE: Record<CoreState, string> = {
  ok: "border-health-good/40 text-health-good",
  attention: "border-severity-warning/40 text-severity-warning",
  running: "border-severity-info/40 text-severity-info",
  error: "border-destructive/40 text-destructive",
  pending: "border-border/60 text-muted-foreground",
};

const OPTIONAL_TONE: Record<OptionalState, string> = {
  configured: "border-health-good/40 text-health-good",
  pending: "border-severity-warning/40 text-severity-warning",
  not_configured: "border-border/60 text-muted-foreground",
};

function InstallationDetailPage() {
  const { id } = Route.useParams();
  const { novo } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const getFn = useServerFn(getInstallationFn);
  const startFn = useServerFn(startInstallationOperationFn);
  const completeFn = useServerFn(completeInstallationOperationFn);
  const cancelFn = useServerFn(cancelInstallationOperationFn);
  const healthFn = useServerFn(refreshInstallationHealthFn);
  const capabilityFn = useServerFn(getAutomationCapabilityFn);
  const autoFn = useServerFn(runAutomatedProvisionFn);
  const restartFn = useServerFn(restartAutomatedProvisionFn);
  const resumeFn = useServerFn(resumeAutomatedProvisionFn);

  const [runCommand, setRunCommand] = useState<string | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["installation", id],
    queryFn: () => getFn({ data: { id } }),
    retry: false,
    // Progresso REAL: só faz polling enquanto existe operação viva.
    refetchInterval: (query) =>
      query.state.data?.operations.some(
        (op) => op.status === "pending" || op.status === "running",
      )
        ? 2500
        : false,
  });

  // Provisionamento automático: o MASTER usa as próprias credenciais de gestão.
  // Sem elas, a UI mostra o motivo do BLOCKED e mantém o fallback manual.
  const capability = useQuery({
    queryKey: ["installation-automation"],
    queryFn: () => capabilityFn({ data: undefined }),
    retry: false,
    staleTime: 60_000,
  });
  const automated = capability.data?.available === true;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["installation", id] });
    void qc.invalidateQueries({ queryKey: ["installations"] });
  };

  const start = useMutation({
    mutationFn: (input: { kind: InstallationOperationKind; confirm?: boolean }) =>
      startFn({ data: { id, kind: input.kind as "provision" | "validate" | "update", confirm: input.confirm } }),
    onSuccess: (result) => {
      setRunCommand(result.runCommand);
      setUpdateOpen(false);
      toast.success(
        automated
          ? "Operação aberta."
          : "Operação aberta. Execute a operação na instalação de destino.",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoProvision = useMutation({
    mutationFn: () => autoFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.result === "STARTED") {
        toast.success("Provisionamento iniciado. Acompanhe o progresso por etapa abaixo.");
      } else {
        toast.error(`BLOCKED: ${result.reasons.join(" | ")}`);
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restartProvision = useMutation({
    mutationFn: (input: { force: boolean }) => restartFn({ data: { id, force: input.force } }),
    onSuccess: (result) => {
      if (result.result === "STARTED") toast.success("Provisionamento reiniciado.");
      else toast.error(`BLOCKED: ${result.reasons.join(" | ")}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeProvision = useMutation({
    mutationFn: () => resumeFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.resumed) invalidate();
    },
  });

  // O Worker pode ser reciclado entre lotes. Enquanto esta tela acompanha uma
  // operação automática, o watchdog retoma apenas se não houver heartbeat há
  // 35s; a lease condicional no servidor evita execução concorrente.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const live = detail.data?.operations.find(
        (op) =>
          (op.status === "pending" || op.status === "running") && op.detail.automated === true,
      );
      if (live && !resumeProvision.isPending) resumeProvision.mutate();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [detail.data?.operations, resumeProvision.isPending]);


  const complete = useMutation({
    mutationFn: (input: { operationId: string; ok: boolean; version?: string | null }) =>
      completeFn({ data: input }),
    onSuccess: () => {
      toast.success("Resultado registrado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (operationId: string) => cancelFn({ data: { operationId } }),
    onSuccess: () => {
      toast.success("Operação cancelada. Resultado parcial preservado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const health = useMutation({
    mutationFn: () => healthFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Saúde reavaliada.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando instalação…
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-14 text-center text-sm text-muted-foreground">
          <p>{(detail.error as Error | null)?.message ?? "Instalação indisponível."}</p>
          <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/admin/instalacoes" })}>
            Voltar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const inst = detail.data.installation;
  const operations = detail.data.operations;
  const activeOp = operations.find((op) => op.status === "pending" || op.status === "running");
  const lastProvision = operations.find((op) => op.kind === "provision" || op.kind === "update");
  const lastValidate = operations.find((op) => op.kind === "validate");
  const shownProvision = activeOp?.kind === "validate" ? lastProvision : (activeOp ?? lastProvision);
  const staleActive = !!activeOp && isOperationStale(activeOp);
  const failedProvision =
    lastProvision && lastProvision.status === "failed" ? lastProvision : null;

  // Estado definitivo: o núcleo decide READY; integrações opcionais nunca
  // bloqueiam. O MASTER só afirma "configurado" no que a instalação reportou.
  const readiness = computeReadiness({
    core: inst.healthChecks,
    optional: { custom_domain: customDomainState(inst.domain) },
    operationRunning: !!activeOp,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/admin/instalacoes"
            className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Instalações
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{inst.name}</h2>
            <Badge variant="outline" className={cn("text-[10px]", CORE_TONE[readiness.ready ? "ok" : "pending"])}>
              {OVERALL_STATE_ICON[readiness.state]} {OVERALL_STATE_LABEL[readiness.state]}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[inst.status])}>
              {INSTALLATION_STATUS_LABEL[inst.status]}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {INSTALLATION_HEALTH_LABEL[inst.health]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {inst.domain ?? "domínio não informado"} · 1 instalação = 1 aplicação = 1 Supabase = 1
            workspace = 1 domínio operacional
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            disabled={
              !canStartOperation("provision", inst.status) ||
              start.isPending ||
              autoProvision.isPending ||
              !!activeOp
            }
            onClick={() =>
              automated ? autoProvision.mutate() : start.mutate({ kind: "provision" })
            }
          >
            {autoProvision.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : activeOp ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="mr-1.5 h-3.5 w-3.5" />
            )}
            {activeOp
              ? "Provisionando…"
              : automated
                ? "Provisionar automaticamente"
                : "Provisionar instalação"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canStartOperation("validate", inst.status) || start.isPending || !!activeOp}
            onClick={() => start.mutate({ kind: "validate" })}
          >
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Validar instalação
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!inst.updateAvailable || start.isPending || !!activeOp}
            onClick={() => setUpdateOpen(true)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar instalação
          </Button>
          <Button size="sm" variant="ghost" disabled={health.isPending} onClick={() => health.mutate()}>
            {health.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Reavaliar saúde
          </Button>
        </div>
      </div>

      {novo && !inst.lastProvisionedAt && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium">Instalação criada.</p>
              <p className="text-xs text-muted-foreground">
                Ela ainda não está pronta — provisione para aplicar baseline, Storage, seeds,
                secrets, cron e identidade própria.
              </p>
            </div>
            <Button
              size="sm"
              disabled={start.isPending || autoProvision.isPending || !!activeOp}
              onClick={() =>
                automated ? autoProvision.mutate() : start.mutate({ kind: "provision" })
              }
            >
              <Rocket className="mr-1.5 h-3.5 w-3.5" /> Provisionar agora
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 1. RESUMO */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resumo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-xs sm:grid-cols-3">
          <Info label="Domínio" value={inst.domain ?? "—"} />
          <Info label="Supabase" value={inst.supabaseUrl ?? "—"} />
          <Info label="Project ref" value={inst.supabaseProjectRef ?? "—"} />
          <Info label="Repositório" value={inst.gitRepoUrl ?? "—"} />
          <Info label="Deploy" value={inst.deployProject ?? "—"} />
          <Info label="Status geral" value={INSTALLATION_STATUS_LABEL[inst.status]} />
          <Info label="Versão da instalação" value={inst.currentVersion ?? "—"} />
          <Info label="Versão MASTER" value={inst.availableVersion} />
          <Info
            label="Última validação"
            value={inst.lastValidatedAt ? new Date(inst.lastValidatedAt).toLocaleString("pt-BR") : "—"}
          />
        </CardContent>
      </Card>

      {/* 2. NÚCLEO DA INSTALAÇÃO — obrigatório, define READY */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Núcleo da instalação</CardTitle>
          <span className="text-xs text-muted-foreground">
            {readiness.ready
              ? "READY: infraestrutura, secrets, cron, health check, Super Admin e 1 workspace"
              : `Pendente: ${readiness.missingCore.length} item(ns) obrigatório(s)`}
          </span>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-4">
          {CORE_REQUIREMENTS.map((req) => {
            const result = readiness.core[req.id];
            return (
              <div key={req.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p className="text-[10px] uppercase text-muted-foreground">{req.label}</p>
                <Badge variant="outline" className={cn("mt-1 text-[10px]", CORE_TONE[result.state])}>
                  {CORE_STATE_LABEL[result.state]}
                </Badge>
                {result.detail && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{result.detail}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 3. CONFIGURAÇÃO OPCIONAL — nunca bloqueia a instalação */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Configuração opcional</CardTitle>
          <span className="text-xs text-muted-foreground">
            Não bloqueia: a instalação continua operacional sem estas integrações.
          </span>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          {OPTIONAL_CONFIG.map((item) => {
            const state = readiness.optional[item.id];
            return (
              <div key={item.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p className="text-[10px] uppercase text-muted-foreground">{item.label}</p>
                <Badge variant="outline" className={cn("mt-1 text-[10px]", OPTIONAL_TONE[state])}>
                  {OPTIONAL_STATE_LABEL[state]}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Saúde medida pelo MASTER (probe + última validação reportada) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Saúde medida</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-4">
          {HEALTH_CHECKS.map((check) => {
            const result = inst.healthChecks[check.id];
            return (
              <div key={check.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p className="text-[10px] uppercase text-muted-foreground">{check.label}</p>
                <Badge variant="outline" className={cn("mt-1 text-[10px]", CHECK_TONE[result.state])}>
                  {CHECK_STATE_LABEL[result.state]}
                </Badge>
                {result.detail && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{result.detail}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 3. PROVISIONAMENTO */}
      <Card className={cn(activeOp && "border-primary/40")}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            Provisionamento
            {activeOp && (
              <Badge variant="outline" className="gap-1 text-[10px] text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> Em andamento
              </Badge>
            )}
          </CardTitle>
          {shownProvision && (
            <span className="text-xs text-muted-foreground">
              {shownProvision.progress.done}/{shownProvision.progress.total} etapas ·{" "}
              {shownProvision.progress.percent}%
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-2.5">
          {shownProvision && (
            <>
              <Progress value={shownProvision.progress.percent} className="h-1.5" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {activeOp
                    ? currentStepLabel(shownProvision.steps)
                    : (shownProvision.summary ?? "Última execução registrada.")}
                </span>
                {shownProvision.progress.failed > 0 && (
                  <span className="text-destructive">
                    {shownProvision.progress.failed} etapa(s) com falha
                  </span>
                )}
              </div>
            </>
          )}

          {shownProvision ? (
            <StepList steps={shownProvision.steps} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {automated
                ? "Nenhuma execução ainda. O MASTER provisiona o Supabase de destino, gera os secrets exclusivos da instalação e configura as variáveis do deploy automaticamente — nenhum comando manual é necessário."
                : "Nenhuma execução ainda. Clique em “Provisionar instalação” para abrir a operação."}
            </p>
          )}

          {activeOp && staleActive && (
            <div className="rounded-lg border border-severity-warning/40 bg-severity-warning/5 p-2.5 text-[11px] text-muted-foreground">
              A operação não reporta progresso há alguns minutos. Você pode reiniciar o
              provisionamento com segurança — a operação travada é encerrada e apenas UMA nova
              operação é aberta.
            </div>
          )}

          {failedProvision && !activeOp && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
              <p className="text-xs font-medium text-destructive">
                Falhou em: {failedStepLabel(failedProvision.steps)}
              </p>
              {failedProvision.summary && (
                <p className="mt-1 text-[11px] text-muted-foreground">{failedProvision.summary}</p>
              )}
              {failedProvision.errorKind && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Motivo: {failedProvision.errorKind}
                </p>
              )}
            </div>
          )}

          {automated && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeOp ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restartProvision.isPending}
                    onClick={() => restartProvision.mutate({ force: !staleActive })}
                  >
                    {restartProvision.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Reiniciar provisionamento
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(activeOp.id)}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant={failedProvision ? "default" : "outline"}
                  disabled={
                    autoProvision.isPending || !canStartOperation("provision", inst.status)
                  }
                  onClick={() => autoProvision.mutate()}
                >
                  {autoProvision.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Rocket className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {failedProvision ? "Tentar novamente" : "Provisionar automaticamente"}
                </Button>
              )}
            </div>
          )}

          {capability.data && !automated && (
            <div className="rounded-lg border border-severity-warning/40 bg-severity-warning/5 p-2.5">
              <p className="text-xs font-medium">Provisionamento automático BLOCKED</p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {capability.data.blockedReasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>


      {/* 5. VALIDAÇÃO */}
      {lastValidate && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Validação</CardTitle>
            <span className="text-xs text-muted-foreground">
              {lastValidate.progress.done} aprovados · {lastValidate.progress.failed} falhos ·{" "}
              {lastValidate.progress.pending} pendentes
            </span>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <StepList steps={lastValidate.steps} />
            {lastValidate.summary && (
              <p className="pt-1 text-xs text-muted-foreground">{lastValidate.summary}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comando de execução (exibido uma única vez) */}
      {runCommand && !automated && (
        <Card className="border-severity-info/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Executar na instalação de destino</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              O token aparece uma única vez e expira em 2 horas. O MASTER guarda apenas o hash e
              nunca armazena credenciais do destino.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed">
              {runCommand}
            </pre>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(runCommand);
                toast.success("Comando copiado.");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar comando
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 7. HISTÓRICO */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico de operações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {operations.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma operação registrada.</p>
          )}
          {operations.map((op) => (
            <div key={op.id} className="rounded-lg border border-border/60 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{OPERATION_KIND_LABEL[op.kind]}</span>
                <Badge variant="outline" className="text-[10px]">
                  {OPERATION_STATUS_LABEL[op.status]}
                </Badge>
                {op.detail.releaseVersion && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {op.detail.releaseVersion}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {new Date(op.startedAt).toLocaleString("pt-BR")}
                  {op.finishedAt ? ` → ${new Date(op.finishedAt).toLocaleString("pt-BR")}` : ""}
                </span>
              </div>
              {op.summary && <p className="mt-1 text-xs text-muted-foreground">{op.summary}</p>}
              {op.errorKind && (
                <p className="mt-1 text-xs text-destructive">Motivo: {op.errorKind}</p>
              )}
              {(op.status === "pending" || op.status === "running") && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {/* Operação automatizada reporta o próprio resultado: nada de registro manual. */}
                  {!op.detail.automated && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={complete.isPending}
                    onClick={() =>
                      complete.mutate({
                        operationId: op.id,
                        ok: true,
                        version: inst.availableVersion,
                      })
                    }
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Registrar sucesso
                  </Button>
                  )}
                  {!op.detail.automated && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={complete.isPending}
                    onClick={() => complete.mutate({ operationId: op.id, ok: false })}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Registrar falha
                  </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(op.id)}
                  >
                    Cancelar operação
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 6. ATUALIZAÇÃO — confirmação obrigatória */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Atualizar instalação</DialogTitle>
            <DialogDescription>
              {updateSummary(inst.currentVersion, inst.availableVersion)} Configurações específicas
              desta instalação (domínio, secrets, branding e integrações) não são sobrescritas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setUpdateOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={start.isPending}
              onClick={() => start.mutate({ kind: "update", confirm: true })}
            >
              {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar atualização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Etapa em execução (ou a próxima pendente) para o rótulo de progresso. */
function currentStepLabel(steps: OperationStep[]): string {
  const running = steps.find((step) => step.state === "running");
  if (running) return `Executando: ${running.label}${running.detail ? ` — ${running.detail}` : ""}`;
  const pending = steps.find((step) => step.state === "pending");
  return pending ? `Aguardando: ${pending.label}` : "Finalizando…";
}

/** Etapa que falhou, para exibir o motivo objetivo. */
function failedStepLabel(steps: OperationStep[]): string {
  const failed = steps.find((step) => step.state === "error");
  if (!failed) return "etapa não identificada";
  return `${failed.label}${failed.detail ? ` — ${failed.detail}` : ""}`;
}

function StepList({ steps }: { steps: OperationStep[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 px-3 py-1.5"
        >
          <span className="w-6 font-mono text-[11px] text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-xs font-medium">{step.label}</span>
          <span className={cn("ml-auto text-[11px]", STEP_TONE[step.state])}>
            {step.state === "running" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
            {STEP_STATE_LABEL[step.state]}
          </span>
          {step.detail && (
            <span className="w-full truncate text-[11px] text-muted-foreground">{step.detail}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-xs" title={value}>
        {value}
      </p>
    </div>
  );
}
