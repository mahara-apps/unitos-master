// Área Canais → WhatsApp: grade de cards no padrão dos demais canais.
// Evolution (configuração/conexão via modal), Cloud API (em breve) e teste de
// envio avulso. Destinatários ficam no perfil de cada cliente.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsappChannelCard } from "./whatsapp-channel-card";
import { WhatsappManualTestCard } from "./whatsapp-manual-test-card";

export function WhatsappCenter({
  brandId,
  canManage,
}: {
  brandId: string | null;
  canManage: boolean;
}) {
  if (!brandId) {
    return <p className="text-xs text-muted-foreground">Selecione um workspace.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <WhatsappChannelCard brandId={brandId} canManage={canManage} />
      <WhatsappComingSoonCard />
      <WhatsappManualTestCard brandId={brandId} canManage={canManage} />
    </div>
  );
}

/** Canal previsto na arquitetura, ainda sem fluxo funcional. */
export function WhatsappComingSoonCard() {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">WhatsApp Cloud API</div>
          <div className="truncate text-xs text-muted-foreground">
            Integração oficial da Meta para WhatsApp
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
          Em breve
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Este canal ainda não está disponível para configuração.
      </p>
      <Button size="sm" variant="outline" className="w-full" disabled>
        Em breve
      </Button>
    </div>
  );
}
