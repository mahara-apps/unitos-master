// Fluxo de conexão por QR Code (Evolution): solicita o QR, exibe, atualiza o
// estado em intervalos curtos e detecta a conexão concluída.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  configureEvolutionWebhook,
  refreshEvolutionInstanceState,
  requestEvolutionInstanceQr,
  type EvolutionInstanceRow,
  type EvolutionQrResult,
} from "@/lib/evolution-instances.functions";

const POLL_MS = 4_000;
/** QR da Evolution expira rápido; renovamos automaticamente. */
const QR_TTL_MS = 45_000;

export function EvolutionQrDialog({
  brandId,
  instance,
  open,
  onOpenChange,
}: {
  brandId: string;
  instance: EvolutionInstanceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const requestQr = useServerFn(requestEvolutionInstanceQr);
  const refreshState = useServerFn(refreshEvolutionInstanceState);
  const configureWebhook = useServerFn(configureEvolutionWebhook);

  const [qr, setQr] = useState<EvolutionQrResult | null>(null);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const issuedAtRef = useRef<number>(0);
  const webhookRef = useRef<string | null>(null);

  const qrMutation = useMutation({
    mutationFn: async () => {
      // Garante o webhook registrado antes do pareamento (best-effort):
      // com ele a conexão concluída chega por evento, sem depender do polling.
      if (webhookRef.current !== instance!.id) {
        try {
          await configureWebhook({ data: { brandId, instanceId: instance!.id } });
          webhookRef.current = instance!.id;
        } catch (err) {
          console.warn("[Evolution] webhook não registrado", err);
        }
      }
      return requestQr({ data: { brandId, instanceId: instance!.id } });
    },
    onSuccess: (result) => {
      setError(null);
      setQr(result);
      issuedAtRef.current = Date.now();
      if (result.connected) {
        setConnected(true);
        qc.invalidateQueries({ queryKey: ["evolution-instances", brandId] });
      }
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Falha ao gerar o QR Code.");
    },
  });

  // Solicita o primeiro QR ao abrir.
  useEffect(() => {
    if (!open || !instance) return;
    setQr(null);
    setConnected(false);
    setPhone(null);
    setError(null);
    qrMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance?.id]);

  // Polling do estado + renovação do QR expirado.
  useEffect(() => {
    if (!open || !instance || connected) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const state = await refreshState({ data: { brandId, instanceId: instance.id } });
        if (cancelled) return;
        if (state.state === "open") {
          setConnected(true);
          setPhone(state.phoneNumber ?? null);
          qc.invalidateQueries({ queryKey: ["evolution-instances", brandId] });
          toast.success("WhatsApp conectado com sucesso.");
          return;
        }
        if (state.state === "not_found") {
          setError("Instância inexistente no servidor Evolution.");
          return;
        }
        if (Date.now() - issuedAtRef.current > QR_TTL_MS && !qrMutation.isPending) {
          qrMutation.mutate();
        }
      } catch {
        // Falha transitória de rede: mantém o polling.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance?.id, connected, qrMutation.isPending]);

  const waiting = !connected && !error && (qrMutation.isPending || !qr?.qrBase64);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <QrCode className="h-4 w-4" />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription className="text-xs">
            {instance?.label ?? instance?.instanceName ?? ""}
            {instance?.clientName ? ` — ${instance.clientName}` : ""}
          </DialogDescription>
        </DialogHeader>

        {connected ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-health-good" />
            <p className="text-sm font-medium">Conexão concluída</p>
            {phone ? (
              <Badge variant="secondary" className="font-mono text-xs">
                {phone}
              </Badge>
            ) : null}
            <Button size="sm" className="mt-3" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex aspect-square w-full items-center justify-center rounded-md border bg-card p-3">
              {qr?.qrBase64 ? (
                <img
                  src={qr.qrBase64}
                  alt="QR Code para conectar o WhatsApp"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                  {error ? (
                    <span className="max-w-[240px] text-center text-destructive">{error}</span>
                  ) : (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Gerando QR Code…
                    </>
                  )}
                </div>
              )}
            </div>

            {qr?.pairingCode ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" />
                Código de pareamento:
                <span className="font-mono text-foreground">{qr.pairingCode}</span>
              </div>
            ) : null}

            <ol className="space-y-1 text-xs text-muted-foreground">
              <li>1. Abra o WhatsApp no celular.</li>
              <li>2. Toque em Aparelhos conectados → Conectar aparelho.</li>
              <li>3. Aponte a câmera para o QR acima.</li>
            </ol>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {waiting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {error ? "Conexão interrompida" : "Aguardando leitura do QR…"}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={qrMutation.isPending}
                onClick={() => qrMutation.mutate()}
              >
                <RefreshCw className="mr-1.5 h-3 w-3" />
                Novo QR
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
