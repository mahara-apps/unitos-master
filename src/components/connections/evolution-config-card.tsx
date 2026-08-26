// Configuração da Evolution API por workspace (somente estado + formulário).
// Nunca exibe a chave: apenas a versão mascarada devolvida pelo backend.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, PlugZap, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEvolutionConfig, testEvolutionConnection, type EvolutionStatus } from "@/lib/evolution.functions";

export function EvolutionConfigCard({
  brandId,
  status,
  canManage,
}: {
  brandId: string;
  status: EvolutionStatus | undefined;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveEvolutionConfig);
  const testFn = useServerFn(testEvolutionConnection);

  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["evolution-status", brandId] });
    qc.invalidateQueries({ queryKey: ["evolution-instances", brandId] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          brandId,
          baseUrl: baseUrl.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setApiKey("");
      setOpen(false);
      toast.success("Configuração da Evolution salva.");
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Falha ao salvar a configuração."),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { brandId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Conexão com a Evolution confirmada.");
      else toast.error(result.message ?? "Não foi possível falar com a Evolution.");
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Falha ao testar a conexão."),
  });

  const showForm = open || (canManage && !status?.configured);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            Configuração da Evolution
          </p>
          {status?.configured ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {status.baseUrl} · chave {status.maskedApiKey ?? "cadastrada"}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {status?.message ?? "Informe o endereço do servidor e a chave de API para começar."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status?.configured ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={test.isPending || !canManage}
              onClick={() => test.mutate()}
            >
              {test.isPending ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <PlugZap className="mr-1.5 h-3 w-3" />
              )}
              Testar conexão
            </Button>
          ) : null}
          {canManage && status?.configured ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setBaseUrl(status.baseUrl ?? "");
                setOpen((v) => !v);
              }}
            >
              {open ? "Cancelar" : "Editar"}
            </Button>
          ) : null}
        </div>
      </div>

      {showForm ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-[11px]">Endereço do servidor</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://evolution.suaempresa.com"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Chave de API</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.hasApiKey ? "Manter a chave atual" : "Chave da Evolution"}
              className="h-8 text-xs"
              autoComplete="off"
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={baseUrl.trim().length < 4 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3 w-3" />
            )}
            Salvar
          </Button>
        </div>
      ) : null}

      {!canManage && !status?.configured ? (
        <p className="text-[11px] text-muted-foreground">
          Somente o ADMIN do workspace pode configurar a Evolution.
        </p>
      ) : null}
    </div>
  );
}
