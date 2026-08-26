// Painel de instâncias WhatsApp (Evolution) com o fluxo de conexão por QR Code.
// Sem inbox nem envio de mensagens — apenas ciclo de vida e pareamento.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createEvolutionInstance,
  listEvolutionInstances,
  refreshEvolutionInstanceState,
  type EvolutionInstanceRow,
} from "@/lib/evolution-instances.functions";
import { EvolutionQrDialog } from "./evolution-qr-dialog";

function statusBadge(row: EvolutionInstanceRow) {
  if (row.status === "connected") return { label: "Conectado", variant: "default" as const };
  if (row.status === "qr_pending") return { label: "Aguardando QR", variant: "secondary" as const };
  if (row.status === "connecting") return { label: "Conectando", variant: "secondary" as const };
  if (row.status === "missing") return { label: "Inexistente", variant: "destructive" as const };
  return { label: "Desconectado", variant: "outline" as const };
}

export function EvolutionWhatsappPanel({
  brandId,
  canManage,
}: {
  brandId: string | null;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listEvolutionInstances);
  const createFn = useServerFn(createEvolutionInstance);
  const refreshFn = useServerFn(refreshEvolutionInstanceState);

  const [label, setLabel] = useState("");
  const [qrTarget, setQrTarget] = useState<EvolutionInstanceRow | null>(null);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["evolution-instances", brandId],
    queryFn: () => listFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { brandId: brandId!, label: label.trim() } }),
    onSuccess: () => {
      setLabel("");
      toast.success("Instância criada. Gere o QR Code para conectar.");
      qc.invalidateQueries({ queryKey: ["evolution-instances", brandId] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Falha ao criar a instância."),
  });

  const refresh = useMutation({
    mutationFn: (instanceId: string) => refreshFn({ data: { brandId: brandId!, instanceId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evolution-instances", brandId] }),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Falha ao consultar o estado."),
  });

  if (!brandId) {
    return <p className="text-xs text-muted-foreground">Selecione um workspace.</p>;
  }

  return (
    <div className="space-y-3">
      {canManage ? (
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nome da instância (ex.: Atendimento)"
            className="h-8 max-w-xs text-xs"
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={label.trim().length < 2 || create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus className="mr-1.5 h-3 w-3" />
            Criar instância
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando instâncias…
        </p>
      ) : instances.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma instância WhatsApp neste workspace.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {instances.map((row) => {
            const badge = statusBadge(row);
            return (
              <Card key={row.id}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{row.label ?? row.instanceName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.clientName ?? "Workspace"}
                      {row.phoneNumber ? ` — ${row.phoneNumber}` : ""}
                    </p>
                    <Badge variant={badge.variant} className="text-[10px]">
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={refresh.isPending}
                      onClick={() => refresh.mutate(row.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    {canManage && row.status !== "connected" ? (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setQrTarget(row)}
                      >
                        <QrCode className="mr-1.5 h-3 w-3" />
                        Conectar
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EvolutionQrDialog
        brandId={brandId}
        instance={qrTarget}
        open={!!qrTarget}
        onOpenChange={(open) => {
          if (!open) setQrTarget(null);
        }}
      />
    </div>
  );
}
