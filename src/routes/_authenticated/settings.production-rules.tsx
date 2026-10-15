/**
 * Regras de produção padrão do workspace. Valem para todos os clientes que
 * seguem o padrão; clientes com exceção não são afetados.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardPageShell, DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
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
import { SettingsPageState, SettingsLoadingState } from "@/components/settings/settings-page-state";
import { ApprovalFields, ScopeFields } from "@/components/customer/production/policy-fields";
import { usePageHeader } from "@/hooks/use-page-header";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAccessRole } from "@/hooks/use-access-role";
import { describeError } from "@/lib/errors";
import {
  APPROVAL_STAGES,
  APPROVAL_STAGE_LABEL,
  defaultApprovalPolicy,
  defaultScopePolicy,
  type ApprovalPolicy,
  type ScopePolicy,
} from "@/lib/client-policy";
import { getWorkspacePoliciesFn, setWorkspacePoliciesFn } from "@/lib/client-policy.functions";

export const Route = createFileRoute("/_authenticated/settings/production-rules")({
  component: ProductionRulesPage,
  head: () => ({
    meta: [
      { title: "Regras de produção · Unitos" },
      {
        name: "description",
        content: "Defina a aprovação do cliente e o limite de produção padrão para todos os clientes.",
      },
      { property: "og:title", content: "Regras de produção · Unitos" },
      {
        property: "og:description",
        content: "Padrão de aprovação e limite de produção do workspace, com exceção por cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Editor({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const { role } = useAccessRole();
  const canEdit = role === "admin";
  const get = useServerFn(getWorkspacePoliciesFn);
  const q = useQuery({
    queryKey: ["workspace-policies", brandId],
    queryFn: () => get({ data: { brandId } }),
  });
  const [approval, setApproval] = useState<ApprovalPolicy>(defaultApprovalPolicy());
  const [scope, setScope] = useState<ScopePolicy>(defaultScopePolicy());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setApproval(q.data.approval);
    setScope(q.data.scope);
  }, [q.data]);

  const save = useServerFn(setWorkspacePoliciesFn);
  const saveM = useMutation({
    mutationFn: (pendingAction: "keep" | "release") =>
      save({ data: { brandId, approval, scope, pendingAction } }),
    onSuccess: (res) => {
      const total = res.released.plan + res.released.content + res.released.schedule;
      toast.success("Padrão do workspace salvo.", {
        description: total > 0 ? `${total} item(ns) liberado(s) para o time seguir.` : undefined,
      });
      void qc.invalidateQueries({ queryKey: ["workspace-policies", brandId] });
      void qc.invalidateQueries({ queryKey: ["client-policies", brandId] });
    },
    onError: (e) => toast.error(`Não foi possível salvar: ${describeError(e)}`),
  });

  if (q.isLoading) return <SettingsLoadingState />;
  if (q.isError || !q.data) {
    return (
      <SettingsPageState
        kind="error"
        title="Não foi possível carregar as regras"
        description={describeError(q.error)}
        actionLabel="Tentar novamente"
        onAction={() => void q.refetch()}
      />
    );
  }

  const { clients, pending } = q.data;
  const waivedWithPending = APPROVAL_STAGES.filter(
    (s) => approval[s] === "internal" && pending[s] > 0,
  );
  const busy = !canEdit || saveM.isPending;

  return (
    <>
      <PageKpiGrid>
        <PageKpi label="Clientes" value={clients.total} />
        <PageKpi label="Seguem o padrão de aprovação" value={clients.inheritingApproval} />
        <PageKpi
          label="Com exceção de aprovação"
          value={clients.total - clients.inheritingApproval}
        />
        <PageKpi label="Seguem o padrão de limite" value={clients.inheritingScope} />
      </PageKpiGrid>

      <DashboardPanelSurface className="space-y-6 p-5">
        <p className="text-sm text-muted-foreground">
          Estas regras valem para todos os clientes que seguem o padrão. Exceções são definidas na
          aba Produção de cada cliente e não mudam aqui.
        </p>
        <ApprovalFields approval={approval} onChange={setApproval} disabled={busy} pending={pending} />
        <ScopeFields scope={scope} onChange={setScope} disabled={busy} />
        {!canEdit ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> Apenas Owner e Admin podem alterar estas regras.
          </p>
        ) : (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={saveM.isPending}
              onClick={() =>
                waivedWithPending.length > 0 ? setConfirmOpen(true) : saveM.mutate("keep")
              }
            >
              {saveM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar padrão
            </Button>
          </div>
        )}
      </DashboardPanelSurface>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existem itens aguardando o cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Nos clientes que seguem o padrão:{" "}
              {waivedWithPending
                .map((s) => `${pending[s]} em ${APPROVAL_STAGE_LABEL[s].toLowerCase()}`)
                .join(", ")}
              . Liberar agora para o time seguir, ou manter aguardando o cliente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                saveM.mutate("keep");
              }}
            >
              Manter aguardando
            </Button>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                saveM.mutate("release");
              }}
            >
              Liberar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProductionRulesPage() {
  const { brandId } = useActiveContext();
  usePageHeader({ title: "Regras de produção", subtitle: "Padrão para todos os clientes" }, []);
  return (
    <DashboardPageShell>
      {brandId ? (
        <Editor brandId={brandId} />
      ) : (
        <SettingsPageState
          title="Nenhum workspace selecionado"
          description="Selecione um workspace para configurar as regras de produção."
        />
      )}
    </DashboardPageShell>
  );
}
