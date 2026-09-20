import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  FileCheck2,
  LockKeyhole,
  RotateCcw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
import {
  canExecuteControlPlaneRepair,
  formatControlPlaneRepairReport,
  type ControlPlaneRepairReport,
  type RepairGateStatus,
} from "@/lib/installation/control-plane-repair-contract";
import { cn } from "@/lib/utils";

const GATE_STATUS: Record<RepairGateStatus, { label: string; className: string }> = {
  pass: { label: "Comprovado", className: "border-health-good/40 text-health-good" },
  block: { label: "Bloqueado", className: "border-destructive/40 text-destructive" },
  pending: { label: "Pendente", className: "border-severity-warning/40 text-severity-warning" },
};

export function ControlPlaneRepairPlan({ report }: { report: ControlPlaneRepairReport }) {
  const [copied, setCopied] = useState(false);
  const passingGates = report.gates.filter((gate) => gate.status === "pass").length;
  const executable = canExecuteControlPlaneRepair(report.gates);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formatControlPlaneRepairReport(report));
      setCopied(true);
      toast.success("Relatório copiado.");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Não foi possível copiar o relatório.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">Reparação do Control-plane</h2>
            <Badge variant="destructive">BLOCK</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {report.planVersion}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Plano preparatório para a infraestrutura existente. Esta tela não executa alterações.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void copyReport()}>
          {copied ? <CheckCircle2 className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar relatório"}
        </Button>
      </header>

      <AlertBanner
        severity="critical"
        icon={ShieldAlert}
        title="Execução bloqueada"
        description="Todos os pré-requisitos precisam ser comprovados em uma autorização posterior e independente."
        trailing="BLOCK"
        className="items-start [&>div>div]:whitespace-normal [&>div>div]:overflow-visible"
      />

      <PageKpiGrid columns={4}>
        <PageKpi
          icon={<AlertTriangle />}
          label="Bloqueios remotos"
          value={report.blockers.length}
          status="danger"
          description="confirmados"
        />
        <PageKpi
          icon={<ShieldCheck />}
          label="Pré-requisitos"
          value={`${passingGates}/${report.gates.length}`}
          status={executable ? "success" : "warning"}
          description="comprovados"
        />
        <PageKpi
          icon={<FileCheck2 />}
          label="Artefatos selados"
          value={report.artifacts.length}
          status="success"
          description={`release ${report.releaseVersion}`}
        />
        <PageKpi
          icon={<Clock3 />}
          label="Etapas ordenadas"
          value={report.steps.length}
          status="info"
          description="autorizações independentes"
        />
      </PageKpiGrid>

      <section className="space-y-3" aria-labelledby="remote-blockers-title">
        <div>
          <h3 id="remote-blockers-title" className="text-base font-semibold">
            Bloqueios remotos confirmados
          </h3>
          <p className="text-xs text-muted-foreground">{report.remoteEvidence}</p>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {report.blockers.map((blocker) => (
            <div
              key={blocker.id}
              className="flex min-w-0 items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3"
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{blocker.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {blocker.evidence}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="gates-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="gates-title" className="text-base font-semibold">
              Pré-requisitos de execução
            </h3>
            <p className="text-xs text-muted-foreground">
              Ausência ou ambiguidade mantém o fluxo fechado.
            </p>
          </div>
          <Badge variant="outline">
            {passingGates} de {report.gates.length}
          </Badge>
        </div>
        <div className="divide-y rounded-lg border">
          {report.gates.map((gate) => {
            const state = GATE_STATUS[gate.status];
            return (
              <div key={gate.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  {gate.status === "pass" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-health-good" />
                  ) : (
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{gate.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {gate.requirement}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={cn("w-fit shrink-0", state.className)}>
                  {state.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="plan-title">
        <div>
          <h3 id="plan-title" className="text-base font-semibold">
            Ordem de execução proposta
          </h3>
          <p className="text-xs text-muted-foreground">
            Cada etapa depende da anterior e exige autorização própria; nada é executado nesta tela.
          </p>
        </div>
        <div className="relative space-y-3 before:absolute before:bottom-5 before:left-4 before:top-5 before:w-px before:bg-border">
          {report.steps.map((step) => (
            <Card key={step.id} className="relative ml-0 overflow-hidden sm:ml-1">
              <CardHeader className="pb-3 pl-12">
                <span className="absolute left-3 top-4 z-10 grid h-7 w-7 place-items-center rounded-full border bg-background text-xs font-semibold tabular-nums">
                  {step.order}
                </span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-sm">{step.title}</CardTitle>
                    <CardDescription className="mt-1 font-mono text-[11px]">
                      {step.artifact}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit text-[10px]">
                    aprovação separada
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pl-12 text-xs">
                <Accordion type="single" collapsible>
                  <AccordionItem value="details" className="border-0">
                    <AccordionTrigger className="py-1.5 text-xs">
                      Dependências e garantias
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2 text-xs">
                      <Detail label="Depende de" value={step.dependsOn.join(" → ")} mono />
                      <Detail label="Confirmação" value={step.approval} mono />
                      <Detail label="Idempotência" value={step.idempotency} />
                      <Detail label="Rollback" value={step.rollback} icon={<RotateCcw />} />
                      <Detail label="Validação posterior" value={step.validations.join(" · ")} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-health-good" /> Operação Apex protegida
            </CardTitle>
            <CardDescription>Nenhuma etapa preparatória pode alterar este estado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <Detail label="Instalação" value={report.apexProtection.installationId} mono />
            <Detail label="Operação" value={report.apexProtection.operationId} mono />
            <Detail label="Estado exigido" value={report.apexProtection.requiredState} mono />
            <p className="rounded-md border border-health-good/25 bg-health-good/5 p-3 leading-relaxed text-muted-foreground">
              {report.apexProtection.invariant}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ServerCog className="h-4 w-4 text-destructive" /> Ações proibidas
            </CardTitle>
            <CardDescription>Restrições permanentes deste fluxo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.prohibitedActions.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Integridade dos artefatos</CardTitle>
          <CardDescription>Arquivos locais selados para a execução futura.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4 font-medium">Arquivo</th>
                <th className="pb-2 pr-4 font-medium">Finalidade</th>
                <th className="pb-2 font-medium">SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.artifacts.map((artifact) => (
                <tr key={artifact.file}>
                  <td className="py-2.5 pr-4 font-mono">{artifact.file}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{artifact.purpose}</td>
                  <td className="py-2.5 font-mono text-[10px] text-muted-foreground">
                    {artifact.sha256}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <p className="font-semibold">Status final: BLOCK</p>
          <p className="mt-1 text-sm text-muted-foreground">{report.nextDecision}</p>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)]">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        {icon}
        {label}
      </span>
      <span
        className={cn("min-w-0 break-words text-muted-foreground", mono && "font-mono text-[11px]")}
      >
        {value}
      </span>
    </div>
  );
}
