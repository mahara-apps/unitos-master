// Regras do cliente: seguem o padrão do workspace ou viram exceção deste
// cliente. Somente Owner/Admin alteram.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
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
import { getClientPoliciesFn, setClientPoliciesFn } from "@/lib/client-policy.functions";
import { ApprovalFields, ScopeFields } from "./policy-fields";

function InheritToggle({
  inherits,
  onChange,
  disabled,
}: {
  inherits: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 p-3 text-sm">
      <span className="flex items-center gap-2">
        Seguir padrão do workspace
        <Badge variant="outline">{inherits ? "Padrão" : "Exceção deste cliente"}</Badge>
      </span>
      <Switch
        aria-label="Seguir padrão do workspace"
        checked={inherits}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  );
}

export function ClientRules({ brandId, clientId }: { brandId: string; clientId: string }) {
  const qc = useQueryClient();
  const { role } = useAccessRole();
  const canEdit = role === "admin";

  const get = useServerFn(getClientPoliciesFn);
  const q = useQuery({
    queryKey: ["client-policies", brandId, clientId],
    queryFn: () => get({ data: { brandId, clientId } }),
    staleTime: 20_000,
  });

  const [approval, setApproval] = useState<ApprovalPolicy>(defaultApprovalPolicy());
  const [scope, setScope] = useState<ScopePolicy>(defaultScopePolicy());
  const [inheritApproval, setInheritApproval] = useState(true);
  const [inheritScope, setInheritScope] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setApproval(q.data.approval);
    setScope(q.data.scope);
    setInheritApproval(q.data.inherits.approval);
    setInheritScope(q.data.inherits.scope);
  }, [q.data]);

  const effectiveApproval = inheritApproval && q.data ? q.data.workspace.approval : approval;
  const effectiveScope = inheritScope && q.data ? q.data.workspace.scope : scope;

  const save = useServerFn(setClientPoliciesFn);
  const saveM = useMutation({
    mutationFn: (pendingAction: "keep" | "release") =>
      save({
        data: {
          brandId,
          clientId,
          approval: inheritApproval ? null : approval,
          scope: inheritScope ? null : scope,
          pendingAction,
        },
      }),
    onSuccess: (res) => {
      const total = res.released.plan + res.released.content + res.released.schedule;
      toast.success("Regras do cliente salvas.", {
        description: total > 0 ? `${total} item(ns) liberado(s) para o time seguir.` : undefined,
      });
      void qc.invalidateQueries({ queryKey: ["client-policies", brandId, clientId] });
      void qc.invalidateQueries({ queryKey: ["workspace-policies", brandId] });
      void qc.invalidateQueries({ queryKey: ["plan-overages", brandId, clientId] });
    },
    onError: (e) => toast.error(`Não foi possível salvar: ${describeError(e)}`),
  });

  const pending = q.data?.pending ?? { plan: 0, content: 0, schedule: 0 };
  const waivedWithPending = APPROVAL_STAGES.filter(
    (s) => effectiveApproval[s] === "internal" && (pending[s] ?? 0) > 0,
  );

  const onSave = () => {
    if (waivedWithPending.length > 0) setConfirmOpen(true);
    else saveM.mutate("keep");
  };

  if (q.isLoading) {
    return (
      <DashboardPanelSurface className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </DashboardPanelSurface>
    );
  }

  const busy = !canEdit || saveM.isPending;

  return (
    <DashboardPanelSurface className="space-y-6 p-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Regras do cliente</h3>
        <p className="text-xs text-muted-foreground">
          Por padrão o cliente segue as{" "}
          <Link to="/settings/production-rules" className="underline underline-offset-2">
            regras de produção do workspace
          </Link>
          . Desligue "Seguir padrão" apenas para exceções.
        </p>
      </div>

      <div className="space-y-3">
        <InheritToggle inherits={inheritApproval} onChange={setInheritApproval} disabled={busy} />
        <ApprovalFields
          approval={effectiveApproval}
          onChange={setApproval}
          disabled={busy || inheritApproval}
          pending={pending}
        />
      </div>

      <div className="space-y-3">
        <InheritToggle inherits={inheritScope} onChange={setInheritScope} disabled={busy} />
        <ScopeFields
          scope={effectiveScope}
          onChange={setScope}
          disabled={busy || inheritScope}
        />
      </div>

      {!canEdit ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> Apenas Owner e Admin podem alterar estas regras.
        </p>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={onSave} disabled={saveM.isPending}>
            {saveM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar regras
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existem itens aguardando o cliente</AlertDialogTitle>
            <AlertDialogDescription>
              {waivedWithPending
                .map((s) => `${pending[s]} em ${APPROVAL_STAGE_LABEL[s].toLowerCase()}`)
                .join(", ")}
              . Você quer liberar agora para o time seguir, ou manter aguardando a resposta do
              cliente?
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
    </DashboardPanelSurface>
  );
}
