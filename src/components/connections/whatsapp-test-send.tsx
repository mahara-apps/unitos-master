// Envio de mensagem de teste pelo serviço único de WhatsApp.
// O frontend só informa recipientId + instanceId: nada de telefone manual,
// chave de API ou detalhes da Evolution.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sendWhatsappMessage } from "@/lib/whatsapp-recipients.functions";
import { WHATSAPP_RECIPIENT_LABELS, type WhatsappRecipientRow } from "@/lib/whatsapp/types";

export function WhatsappTestSend({
  brandId,
  instanceId,
  connected,
  recipients,
  canManage,
}: {
  brandId: string;
  instanceId: string | null;
  connected: boolean;
  recipients: WhatsappRecipientRow[];
  canManage: boolean;
}) {
  const sendFn = useServerFn(sendWhatsappMessage);
  const [recipientId, setRecipientId] = useState("");
  const [message, setMessage] = useState("Mensagem de teste enviada pelo Unitos.");

  const active = recipients.filter((r) => r.isActive);

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          brandId,
          instanceId: instanceId!,
          recipientIds: [recipientId],
          message: message.trim(),
        },
      }),
  });

  const failure = send.data?.results.find((r) => r.status !== "sent");
  const disabled =
    !canManage || !connected || !instanceId || !recipientId || message.trim().length === 0;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          Enviar mensagem de teste
        </p>
        <p className="text-[11px] text-muted-foreground">
          Usa a conexão ativa e um destinatário já cadastrado.
        </p>
      </div>

      {!connected ? (
        <p className="text-xs text-muted-foreground">
          Conecte o WhatsApp para habilitar o envio de teste.
        </p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Cadastre um destinatário ativo abaixo para enviar o teste.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-[minmax(0,240px)_1fr_auto] md:items-start">
          <Select value={recipientId} onValueChange={setRecipientId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Destinatário" />
            </SelectTrigger>
            <SelectContent>
              {active.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {r.userName ?? r.name}
                  {r.clientName ? ` · ${r.clientName}` : ""} — {WHATSAPP_RECIPIENT_LABELS[r.type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mensagem"
            rows={2}
            className="text-xs"
          />

          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={disabled || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3 w-3" />
            )}
            {send.isPending ? "Enviando…" : "Enviar teste"}
          </Button>
        </div>
      )}

      {send.isError ? (
        <p className="flex items-center gap-1.5 text-[11px] text-destructive">
          <TriangleAlert className="h-3 w-3" />
          {send.error instanceof Error ? send.error.message : "Falha ao enviar a mensagem."}
        </p>
      ) : send.isSuccess ? (
        failure ? (
          <p className="flex items-center gap-1.5 text-[11px] text-destructive">
            <TriangleAlert className="h-3 w-3" />
            {failure.error ?? "A Evolution recusou o envio."}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] text-health-good">
            <CheckCircle2 className="h-3 w-3" />
            Mensagem enviada.
          </p>
        )
      ) : null}
    </div>
  );
}
