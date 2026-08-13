import { createFileRoute, Link } from "@tanstack/react-router";

import { DashboardPageShell, DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { Button } from "@/components/ui/button";

// Os excedentes agora vivem no perfil do cliente (aba "Produção").
// Esta rota permanece apenas para não quebrar links antigos.
export const Route = createFileRoute("/_authenticated/settings/overages")({
  component: OveragesMoved,
});

function OveragesMoved() {
  return (
    <DashboardPageShell>
      <DashboardPanelSurface className="space-y-3 p-6">
        <h2 className="text-sm font-semibold">Excedentes mudaram de lugar</h2>
        <p className="text-sm text-muted-foreground">
          As solicitações extras e a liberação de excedentes agora ficam no perfil do cliente, na
          aba <strong>Produção</strong>, junto do relatório do que foi produzido.
        </p>
        <Button asChild size="sm">
          <Link to="/customers">Ir para clientes</Link>
        </Button>
      </DashboardPanelSurface>
    </DashboardPageShell>
  );
}
