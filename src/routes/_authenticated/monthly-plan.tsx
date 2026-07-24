import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { z } from "zod";

import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { MonthlyPlanView } from "./customers.$customerId.pauta";

const SearchSchema = z.object({ planId: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/monthly-plan")({
  validateSearch: (s: Record<string, unknown>) => SearchSchema.parse(s),
  component: MonthlyPlanPage,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function MonthlyPlanPage() {
  const { brandId, clientId } = useActiveContext();

  usePageHeader(
    {
      title: "Pauta mensal",
      subtitle: "Planeje os temas do mês antes de produzir os posts",
    },
    [clientId],
  );

  if (!brandId || !clientId || !UUID_RE.test(brandId) || !UUID_RE.test(clientId)) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Selecione um cliente no seletor acima para acessar a Pauta.
        </div>
      </div>
    );
  }

  return <MonthlyPlanView brandId={brandId} clientId={clientId} />;
}