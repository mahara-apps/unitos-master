// Área Canais → WhatsApp: configuração, conexão (QR), destinatários e
// teste de envio em uma única tela. Sem inbox, atendimento ou conversas.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getEvolutionStatus } from "@/lib/evolution.functions";
import { listEvolutionInstances } from "@/lib/evolution-instances.functions";
import { listWhatsappRecipients } from "@/lib/whatsapp-recipients.functions";
import { EvolutionConfigCard } from "./evolution-config-card";
import { EvolutionConnectionCard } from "./evolution-connection-card";
import { WhatsappRecipientsPanel } from "./whatsapp-recipients-panel";
import { WhatsappTestSend } from "./whatsapp-test-send";

export function WhatsappCenter({
  brandId,
  canManage,
}: {
  brandId: string | null;
  canManage: boolean;
}) {
  const statusFn = useServerFn(getEvolutionStatus);
  const instancesFn = useServerFn(listEvolutionInstances);
  const recipientsFn = useServerFn(listWhatsappRecipients);

  const { data: status } = useQuery({
    queryKey: ["evolution-status", brandId],
    queryFn: () => statusFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["evolution-instances", brandId],
    queryFn: () => instancesFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const { data: recipients = [] } = useQuery({
    queryKey: ["whatsapp-recipients", brandId],
    queryFn: () => recipientsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  if (!brandId) {
    return <p className="text-xs text-muted-foreground">Selecione um workspace.</p>;
  }

  // Conexão principal: a conectada, senão a mais recente.
  const instance = instances.find((i) => i.status === "connected") ?? instances[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <EvolutionConfigCard brandId={brandId} status={status} canManage={canManage} />

        <EvolutionConnectionCard
          brandId={brandId}
          configured={!!status?.configured}
          instance={instance}
          isLoading={isLoading}
          canManage={canManage}
        />
      </div>

      <WhatsappRecipientsPanel brandId={brandId} canManage={canManage} />

      <WhatsappTestSend
        brandId={brandId}
        instanceId={instance?.id ?? null}
        connected={instance?.status === "connected"}
        recipients={recipients}
        canManage={canManage}
      />
    </div>
  );
}

